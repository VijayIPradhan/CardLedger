import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, assignments, holders, cards, payments } from '../db/schema.js';
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

    return db
      .select({ ...getTableColumns(transactions) })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.txn_date));
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [txn] = await db
      .select({ ...getTableColumns(transactions) })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));
    if (!txn) return reply.status(404).send({ error: 'Not found' });
    return txn;
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify the target card belongs to this user
    const [card] = await db
      .select({ id: cards.id })
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

    const [txn] = await db
      .insert(transactions)
      .values({ ...rest, amount: String(amount), holder_id_at_time: finalHolderId })
      .returning();

    // Atomically create a payment record if funded by someone else
    if ((rest.type === 'payment' || rest.type === 'bill_payment') && funded_by_holder_id) {
      await db.insert(payments).values({
        holder_id: funded_by_holder_id,
        transaction_id: linked_transaction_id ?? txn.id,
        amount: String(amount),
        payment_date: rest.txn_date,
      });

      if (linked_transaction_id) {
        await db
          .update(transactions)
          .set({ is_paid: true })
          .where(eq(transactions.id, linked_transaction_id));
      }
    }

    return reply.status(201).send(txn);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify ownership via card join
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const { amount, txn_date, ...rest } = parsed.data;
    const update: any = { ...rest };
    if (amount !== undefined) update.amount = String(amount);
    if (txn_date !== undefined) update.txn_date = txn_date;

    const [txn] = await db
      .update(transactions)
      .set(update)
      .where(eq(transactions.id, req.params.id))
      .returning();

    if (amount !== undefined || txn_date !== undefined) {
      const paymentUpdate: any = {};
      if (amount !== undefined) paymentUpdate.amount = String(amount);
      if (txn_date !== undefined) paymentUpdate.payment_date = txn_date;
      await db.update(payments).set(paymentUpdate).where(eq(payments.transaction_id, txn.id));
    }

    return txn;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    // Verify ownership and existence in one query; returns 404 for non-existent or foreign rows
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(transactions.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    // Delete associated payments first
    await db.delete(payments).where(eq(payments.transaction_id, req.params.id));
    await db.delete(transactions).where(eq(transactions.id, req.params.id));
    return reply.status(204).send();
  });
}
