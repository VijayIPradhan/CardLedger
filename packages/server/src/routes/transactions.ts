import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  transactions,
  assignments,
  holders,
  cards,
  payments,
  card_payments,
} from '../db/schema.js';
import { eq, and, getTableColumns, desc } from 'drizzle-orm';
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  resolveHolder,
} from '@cardledger/shared';

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

    // Fetch card_payments to merge as 'bill_payment' transactions
    const cPayments = await db
      .select({ ...getTableColumns(card_payments) })
      .from(card_payments)
      .innerJoin(cards, eq(card_payments.card_id, cards.id))
      .where(and(...cpConditions));

    const cpMap = new Map<string, number>();
    cPayments.forEach((p) => {
      if (p.transaction_id) {
        cpMap.set(p.transaction_id, (cpMap.get(p.transaction_id) || 0) + Number(p.amount));
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

    const formattedPayments = cPayments.map((p) => {
      let pd = p.payment_date as any;
      if (pd instanceof Date) {
        pd = pd.toISOString().split('T')[0];
      } else if (typeof pd === 'string') {
        pd = pd.split('T')[0];
      }
      return {
        id: p.id,
        card_id: p.card_id,
        amount: p.amount,
        merchant: p.notes || 'Payment to Bank',
        txn_date: pd,
        source: 'manual',
        type: 'bill_payment',
        category: null,
        tags: null,
        original_currency: null,
        original_amount: null,
        forex_markup_fee: null,
        reward_earned: null,
        reward_currency: null,
        is_paid: true, // bill payments don't have is_paid
        holder_id_at_time: p.holder_id, // map holder_id to holder_id_at_time
        raw_sms_encrypted: null,
        dedupe_hash: null,
        created_at: p.created_at,
        bank_paid_amount: 0,
      };
    });

    // Filter formattedPayments if holder_id was provided
    const filteredPayments = holder_id
      ? formattedPayments.filter((p) => p.holder_id_at_time === holder_id)
      : formattedPayments;

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
      const allAssignments = await db
        .select()
        .from(assignments)
        .where(eq(assignments.card_id, parsed.data.card_id));
      const mapped = allAssignments.map((a) => ({
        id: a.id,
        card_id: a.card_id,
        holder_id: a.holder_id,
        handed_over_date: String(a.handed_over_date),
        returned_date: a.returned_date ? String(a.returned_date) : null,
        created_at: String(a.created_at),
      }));
      holderId = resolveHolder(parsed.data.card_id, parsed.data.txn_date, mapped);
      if (!holderId && mapped.length > 0) holderId = mapped[0].holder_id;
      if (!holderId) {
        const [me] = await db
          .select()
          .from(holders)
          .where(and(eq(holders.relationship, 'me'), eq(holders.user_id, userId)))
          .limit(1);
        if (me) holderId = me.id;
      }
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
      return { ...rest, id: newPayment.id, amount: String(amount) };
    }

    if (rest.type === 'bill_payment') {
      // Fast path for bill payments: create a card_payment instead of a transaction
      const [newCardPayment] = await db
        .insert(card_payments)
        .values({
          card_id: parsed.data.card_id,
          holder_id: funded_by_holder_id || finalHolderId,
          transaction_id: linked_transaction_id || null,
          amount: String(amount),
          payment_date: rest.txn_date || new Date().toISOString().split('T')[0],
          notes: rest.merchant || 'Bill Payment',
        })
        .returning();
      return { ...rest, id: newCardPayment.id, amount: String(amount) };
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

      // Atomically create a payment record if funded by someone else
      if ((rest.type === 'payment' || rest.type === 'bill_payment') && funded_by_holder_id) {
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
      const [existingCp] = await db
        .select({ id: card_payments.id })
        .from(card_payments)
        .innerJoin(cards, eq(card_payments.card_id, cards.id))
        .where(and(eq(card_payments.id, req.params.id), eq(cards.user_id, userId)));

      if (!existingCp) return reply.status(404).send({ error: 'Not found' });

      const { amount, txn_date, merchant, holder_id_at_time } = parsed.data;
      const updateCp: any = {};
      if (amount !== undefined) updateCp.amount = String(amount);
      if (txn_date !== undefined) updateCp.payment_date = txn_date;
      if (merchant !== undefined) updateCp.notes = merchant;
      if (holder_id_at_time !== undefined) updateCp.holder_id = holder_id_at_time;

      const [updatedCp] = await db
        .update(card_payments)
        .set(updateCp)
        .where(eq(card_payments.id, req.params.id))
        .returning();

      return updatedCp;
    }

    const { amount, txn_date, ...rest } = parsed.data;
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
      const [existingCp] = await db
        .select({ id: card_payments.id })
        .from(card_payments)
        .innerJoin(cards, eq(card_payments.card_id, cards.id))
        .where(and(eq(card_payments.id, req.params.id), eq(cards.user_id, userId)));

      if (!existingCp) return reply.status(404).send({ error: 'Not found' });

      await db.delete(card_payments).where(eq(card_payments.id, req.params.id));
      return reply.send({ success: true });
    }

    // Delete associated payments and transaction atomically
    await db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.transaction_id, req.params.id));
      await tx.delete(transactions).where(eq(transactions.id, req.params.id));
    });
    return reply.status(204).send();
  });
}
