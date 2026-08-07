import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards, transactions, assignments } from '../db/schema.js';
import { eq, sql, getTableColumns, and } from 'drizzle-orm';
import { CreateCardSchema, UpdateCardSchema } from '@cardledger/shared';

// Reused in both GET / and GET /:id to keep the spend definition in one place
const currentSpendSql = sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'spend' THEN ${transactions.amount} WHEN ${transactions.type} = 'bill_payment' THEN -${transactions.amount} ELSE 0 END), 0)::text`;

class ConflictError extends Error {}

export async function cardRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req) => {
    const userId = req.user.sub;
    return db
      .select({ ...getTableColumns(cards), current_spend: currentSpendSql })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .where(eq(cards.user_id, userId))
      .groupBy(cards.id)
      .orderBy(cards.created_at);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [card] = await db
      .select({ ...getTableColumns(cards), current_spend: currentSpendSql })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .where(and(eq(cards.id, req.params.id), eq(cards.user_id, userId)))
      .groupBy(cards.id);
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const [card] = await db
      .insert(cards)
      .values({ ...rest, credit_limit: String(credit_limit), user_id: userId })
      .returning();
    return reply.status(201).send(card);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const update =
      credit_limit !== undefined ? { ...rest, credit_limit: String(credit_limit) } : rest;
    const [card] = await db
      .update(cards)
      .set(update)
      .where(and(eq(cards.id, req.params.id), eq(cards.user_id, userId)))
      .returning();
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    try {
      const deleted = await db.transaction(async (tx) => {
        // Verify the card exists and belongs to this user
        const [card] = await tx
          .select({ id: cards.id })
          .from(cards)
          .where(and(eq(cards.id, req.params.id), eq(cards.user_id, userId)));
        if (!card) return null;

        // Check for transactions inside the DB transaction to close the TOCTOU window
        const [txn] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.card_id, req.params.id))
          .limit(1);
        if (txn) throw new ConflictError('Card has transactions');

        await tx.delete(assignments).where(eq(assignments.card_id, req.params.id));
        const [result] = await tx
          .delete(cards)
          .where(eq(cards.id, req.params.id))
          .returning({ id: cards.id });
        return result;
      });

      if (!deleted) return reply.status(404).send({ error: 'Not found' });
      return reply.status(204).send();
    } catch (e) {
      if (e instanceof ConflictError) return reply.status(409).send({ error: e.message });
      throw e;
    }
  });
}
