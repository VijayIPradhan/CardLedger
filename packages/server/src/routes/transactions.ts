import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, assignments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  resolveHolder,
} from '@cardledger/shared';

export async function transactionRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string; holder_id?: string } }>('/', auth, async (req) => {
    const { card_id, holder_id } = req.query;
    const conditions = [];
    if (card_id) conditions.push(eq(transactions.card_id, card_id));
    if (holder_id) conditions.push(eq(transactions.holder_id_at_time, holder_id));
    return db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(transactions.txn_date);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db.select().from(transactions).where(eq(transactions.id, req.params.id));
    if (!txn) return reply.status(404).send({ error: 'Not found' });
    return txn;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    let holderId = parsed.data.holder_id_at_time ?? null;

    // No explicit "who used" → resolve from assignments (SMS import path)
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
      if (!holderId && mapped.length > 0) {
        holderId = mapped[0].holder_id;
      }
    }

    if (!holderId) {
      return reply.status(422).send({ error: 'No holder assignment found for txn_date' });
    }

    const { amount, holder_id_at_time: _holderOverride, ...rest } = parsed.data;
    const [txn] = await db
      .insert(transactions)
      .values({ ...rest, amount: String(amount), holder_id_at_time: holderId })
      .returning();
    return reply.status(201).send(txn);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { amount, ...rest } = parsed.data;
    const update = amount !== undefined ? { ...rest, amount: String(amount) } : rest;
    const [txn] = await db
      .update(transactions)
      .set(update)
      .where(eq(transactions.id, req.params.id))
      .returning();
    if (!txn) return reply.status(404).send({ error: 'Not found' });
    return txn;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    await db.delete(transactions).where(eq(transactions.id, req.params.id));
    return reply.status(204).send();
  });
}
