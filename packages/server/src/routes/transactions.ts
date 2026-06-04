import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, assignments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CreateTransactionSchema, resolveHolder } from '@cardledger/shared';

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

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

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

    const holderId = resolveHolder(parsed.data.card_id, parsed.data.txn_date, mapped);
    if (!holderId) {
      return reply.status(422).send({ error: 'No holder assignment found for txn_date' });
    }

    const [txn] = await db
      .insert(transactions)
      .values({ ...parsed.data, holder_id_at_time: holderId })
      .returning();
    return reply.status(201).send(txn);
  });
}
