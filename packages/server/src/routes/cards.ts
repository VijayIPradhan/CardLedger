import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards, transactions, assignments } from '../db/schema.js';
import { eq, sql, getTableColumns } from 'drizzle-orm';
import { CreateCardSchema, UpdateCardSchema } from '@cardledger/shared';

export async function cardRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async () => {
    return db
      .select({
        ...getTableColumns(cards),
        current_spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.is_paid} = FALSE THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .groupBy(cards.id)
      .orderBy(cards.created_at);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [card] = await db
      .select({
        ...getTableColumns(cards),
        current_spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.is_paid} = FALSE THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .where(eq(cards.id, req.params.id))
      .groupBy(cards.id);
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const [card] = await db
      .insert(cards)
      .values({ ...rest, credit_limit: String(credit_limit) })
      .returning();
    return reply.status(201).send(card);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const update =
      credit_limit !== undefined ? { ...rest, credit_limit: String(credit_limit) } : rest;
    const [card] = await db
      .update(cards)
      .set(update)
      .where(eq(cards.id, req.params.id))
      .returning();
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.card_id, req.params.id))
      .limit(1);
    if (txn) {
      return reply.status(409).send({ error: 'Card has transactions' });
    }
    await db.transaction(async (tx) => {
      await tx.delete(assignments).where(eq(assignments.card_id, req.params.id));
      await tx.delete(cards).where(eq(cards.id, req.params.id));
    });
    return reply.status(204).send();
  });
}
