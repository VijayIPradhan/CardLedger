import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { holders, transactions, assignments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CreateHolderSchema, UpdateHolderSchema } from '@cardledger/shared';

export async function holderRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req) => {
    const userId = req.user.sub;
    return db.select().from(holders).where(eq(holders.user_id, userId)).orderBy(holders.name);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [h] = await db
      .select()
      .from(holders)
      .where(and(eq(holders.id, req.params.id), eq(holders.user_id, userId)));
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db
      .insert(holders)
      .values({ ...parsed.data, user_id: userId })
      .returning();
    return reply.status(201).send(h);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db
      .update(holders)
      .set(parsed.data)
      .where(and(eq(holders.id, req.params.id), eq(holders.user_id, userId)))
      .returning();
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    // Verify ownership before checking dependants
    const [h] = await db
      .select({ id: holders.id })
      .from(holders)
      .where(and(eq(holders.id, req.params.id), eq(holders.user_id, userId)));
    if (!h) return reply.status(404).send({ error: 'Not found' });

    const [txn] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.holder_id_at_time, req.params.id))
      .limit(1);
    const [asg] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.holder_id, req.params.id))
      .limit(1);
    if (txn || asg) {
      return reply.status(409).send({ error: 'Holder has transactions or assignments' });
    }

    await db.delete(holders).where(eq(holders.id, req.params.id));
    return reply.status(204).send();
  });
}
