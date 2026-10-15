import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, holders, cards, payments, card_payments } from '../db/schema.js';
import { eq, and, getTableColumns, desc } from 'drizzle-orm';
import { withAllocations, recomputeSettlement } from '../db/allocations.js';
import {
  addShareToPayment,
  billPaymentRow,
  createCardPayment,
  deleteCardPayment,
  findCardPayment,
  updateCardPayment,
} from '../lib/cardPayments.js';
import { resolveCardHolder } from '../lib/holders.js';
import { handle } from './cardPayments.js';
import { CreateTransactionSchema, UpdateTransactionSchema } from '@cardledger/shared';

export async function transactionRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string; holder_id?: string } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { card_id, holder_id } = req.query;

    // Scope to the user's cards via an inner join; also filter by optional params
    const conditions: ReturnType<typeof eq>[] = [eq(cards.user_id, userId)];
    if (card_id) conditions.push(eq(transactions.card_id, card_id));
    if (holder_id) conditions.push(eq(transactions.holder_id_at_time, holder_id));

    const txns = await db
      .select({ ...getTableColumns(transactions) })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.txn_date));

    const cpConditions: ReturnType<typeof eq>[] = [eq(cards.user_id, userId)];
    if (card_id) cpConditions.push(eq(card_payments.card_id, card_id));

    // Fetch card_payments to merge as 'bill_payment' transactions: one row per payment, with
    // its allocations attached rather than a row per allocation.
    const cPayments = await withAllocations(
      await db
        .select({ ...getTableColumns(card_payments) })
        .from(card_payments)
        .innerJoin(cards, eq(card_payments.card_id, cards.id))
        .where(and(...cpConditions)),
    );

    const cpMap = new Map<string, number>();
    cPayments.forEach((p) => {
      for (const a of p.allocations) {
        cpMap.set(a.transaction_id, (cpMap.get(a.transaction_id) || 0) + Number(a.amount));
      }
    });

    const formattedTxns = txns.map((txn) => {
      let d = txn.txn_date as any;
      if (d instanceof Date) {
        d = d.toISOString().split('T')[0];
      } else if (typeof d === 'string') {
        d = d.split('T')[0];
      }

      return {
        ...txn,
        txn_date: d,
        bank_paid_amount: cpMap.get(txn.id) || 0,
      };
    });

    const formattedPayments = cPayments.map(billPaymentRow);

    // A card payment belongs to a card's history, never a holder's. Its holder_id only records
    // whose spend the money was forwarded against — the holder did not pay the bank, they paid
    // into my account, and that is what the `payments` table already records. Listing it under
    // the friend read as a second collection from them. So a holder-scoped query returns none.
    const filteredPayments = holder_id ? [] : formattedPayments;

    return [...formattedTxns, ...filteredPayments].sort((a, b) => {
      const dateA = new Date(a.txn_date).getTime();
      const dateB = new Date(b.txn_date).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [txn] = await db
      .select({ ...getTableColumns(transactions) })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));
    if (!txn) return reply.status(404).send({ error: 'Not found' });

    let d = txn.txn_date as any;
    if (d instanceof Date) {
      d = d.toISOString().split('T')[0];
    } else if (typeof d === 'string') {
      d = d.split('T')[0];
    }

    return { ...txn, txn_date: d };
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify the target card belongs to this user
    const [card] = await db
      .select({ id: cards.id, rewards_schema: cards.rewards_schema })
      .from(cards)
      .where(and(eq(cards.id, parsed.data.card_id), eq(cards.user_id, userId)));
    if (!card) return reply.status(404).send({ error: 'Card not found' });

    let holderId = parsed.data.holder_id_at_time ?? null;

    if (!holderId) {
      holderId = await resolveCardHolder(userId, parsed.data.card_id, parsed.data.txn_date);
    }

    if (!holderId) {
      return reply.status(422).send({ error: 'No holder assignment found for txn_date' });
    }

    const {
      amount,
      holder_id_at_time: _holderOverride,
      funded_by_holder_id,
      linked_transaction_id,
      ...rest
    } = parsed.data;

    let finalHolderId = holderId;
    if ((rest.type === 'payment' || rest.type === 'bill_payment') && funded_by_holder_id) {
      const [me] = await db
        .select()
        .from(holders)
        .where(and(eq(holders.relationship, 'me'), eq(holders.user_id, userId)))
        .limit(1);
      if (me && funded_by_holder_id !== me.id) {
        finalHolderId = me.id; // Force payment transaction to be assigned to 'me' so it doesn't incorrectly reduce friend's spend
      }
    }

    if (rest.type === 'payment' && funded_by_holder_id && linked_transaction_id) {
      // Fast path for friend collections: DO NOT create a transaction or split the original.
      // Just record the payment against the friend so their debt decreases, without touching card usage!
      const [newPayment] = await db
        .insert(payments)
        .values({
          holder_id: funded_by_holder_id,
          transaction_id: linked_transaction_id,
          amount: String(amount),
          payment_date: rest.txn_date || new Date().toISOString().split('T')[0],
        })
        .returning();
      return {
        id: newPayment.id,
        card_id: parsed.data.card_id,
        amount: String(amount),
        merchant: rest.merchant || 'Friend Payment',
        txn_date: rest.txn_date || new Date().toISOString().split('T')[0],
        source: 'manual',
        type: 'payment',
        is_paid: true,
        holder_id_at_time: finalHolderId,
        linked_transaction_id: linked_transaction_id,
        created_at: newPayment.created_at,
      };
    }

    if (rest.type === 'bill_payment') {
      // Older clients' bill payments: one payment, settling at most the linked transaction (any
      // excess stays unallocated). A request naming a parent is a share of an existing payment.
      return handle(reply, async () => {
        const payment = parsed.data.parent_payment_id
          ? await addShareToPayment(
              userId,
              parsed.data.parent_payment_id,
              parsed.data.card_id,
              linked_transaction_id,
              amount,
            )
          : await createCardPayment(userId, {
              card_id: parsed.data.card_id,
              amount,
              payment_date: rest.txn_date,
              funded_by_holder_id: funded_by_holder_id ?? parsed.data.holder_id_at_time,
              notes: rest.merchant,
              transaction_ids: linked_transaction_id ? [linked_transaction_id] : undefined,
            });
        return billPaymentRow(payment);
      });
    }

    const txn = await db.transaction(async (tx) => {
      let rewardEarned: string | undefined;
      let rewardCurrency: string | undefined;

      if (rest.type === 'spend' && card.rewards_schema) {
        try {
          const schema = card.rewards_schema as any;
          const lowerCategory = rest.category?.toLowerCase() || 'other';
          const rate = schema.categories?.[lowerCategory] ?? schema.base_rate ?? 0;
          if (rate > 0) {
            rewardEarned = String(amount * (rate / 100));
            rewardCurrency = schema.currency || 'points';
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      const insertValues = {
        ...rest,
        amount: String(amount),
        holder_id_at_time: finalHolderId,
        original_amount:
          rest.original_amount !== undefined ? String(rest.original_amount) : undefined,
        forex_markup_fee:
          rest.forex_markup_fee !== undefined ? String(rest.forex_markup_fee) : undefined,
        reward_earned: rewardEarned,
        reward_currency: rewardCurrency,
      };

      const [newTxn] = await tx.insert(transactions).values(insertValues).returning();

      // Atomically create a payment record if funded by someone else (only for cash payments to user)
      if (rest.type === 'payment' && funded_by_holder_id) {
        let finalLinkedTxnId = linked_transaction_id ?? newTxn.id;

        if (linked_transaction_id) {
          const [linkedTxn] = await tx
            .select()
            .from(transactions)
            .where(eq(transactions.id, linked_transaction_id));

          if (linkedTxn) {
            const linkedAmt = parseFloat(linkedTxn.amount);
            if (amount < linkedAmt) {
              // Partial payment: Split the transaction
              const remaining = linkedAmt - amount;

              // 1. Reduce original transaction to the remaining amount (unpaid)
              await tx
                .update(transactions)
                .set({ amount: String(remaining) })
                .where(eq(transactions.id, linked_transaction_id));

              // 2. Clone it for the paid portion
              const [cloned] = await tx
                .insert(transactions)
                .values({
                  card_id: linkedTxn.card_id,
                  type: linkedTxn.type,
                  amount: String(amount),
                  merchant: linkedTxn.merchant,
                  txn_date: linkedTxn.txn_date,
                  holder_id_at_time: linkedTxn.holder_id_at_time,
                  source: linkedTxn.source,
                  is_paid: true,
                })
                .returning();

              finalLinkedTxnId = cloned.id;
            } else {
              // Full payment
              await tx
                .update(transactions)
                .set({ is_paid: true })
                .where(eq(transactions.id, linked_transaction_id));
            }
          }
        }

        await tx.insert(payments).values({
          holder_id: funded_by_holder_id,
          transaction_id: finalLinkedTxnId,
          amount: String(amount),
          payment_date: rest.txn_date || new Date().toISOString().split('T')[0],
        });
      }
      return newTxn;
    });

    return reply.status(201).send(txn);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Try transactions first
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));

    if (!existing) {
      // Fallback to card_payments
      if (!(await findCardPayment(userId, req.params.id))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const {
        amount,
        txn_date,
        merchant,
        holder_id_at_time,
        linked_transaction_id: link,
      } = parsed.data;
      return handle(reply, async () =>
        billPaymentRow(
          await updateCardPayment(userId, req.params.id, {
            amount,
            payment_date: txn_date,
            notes: merchant,
            funded_by_holder_id: holder_id_at_time,
            // Relinking settles the new transaction as far as the payment covers it.
            transaction_ids: link === undefined ? undefined : link ? [link] : [],
          }),
        ),
      );
    }

    const { amount, txn_date, linked_transaction_id, ...rest } = parsed.data;
    const update: any = { ...rest };
    if (amount !== undefined) update.amount = String(amount);
    if (txn_date !== undefined) update.txn_date = txn_date;

    const [txn] = await db
      .update(transactions)
      .set(update)
      .where(eq(transactions.id, req.params.id))
      .returning();

    if (amount !== undefined || txn_date !== undefined || rest.holder_id_at_time !== undefined) {
      const paymentUpdate: any = {};
      if (amount !== undefined) paymentUpdate.amount = String(amount);
      if (txn_date !== undefined) paymentUpdate.payment_date = txn_date;
      if (rest.holder_id_at_time !== undefined) paymentUpdate.holder_id = rest.holder_id_at_time;
      await db.update(payments).set(paymentUpdate).where(eq(payments.transaction_id, txn.id));
    }

    // A new amount can make the payments against it cover it, or stop covering it. An explicit
    // is_paid in the same request is the user's own call and is left alone.
    if (amount !== undefined && rest.is_paid === undefined) {
      await db.transaction((tx) => recomputeSettlement(tx, [txn.id]));
      return (await db.select().from(transactions).where(eq(transactions.id, txn.id)))[0];
    }

    return txn;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));

    if (!existing) {
      if (!(await deleteCardPayment(userId, req.params.id))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.send({ success: true });
    }

    // Friend payments recorded against it go too. Its allocations cascade, so the card payments
    // that settled it simply become unallocated by that much.
    await db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.transaction_id, req.params.id));
      await tx.delete(transactions).where(eq(transactions.id, req.params.id));
    });
    return reply.status(204).send();
  });
}
