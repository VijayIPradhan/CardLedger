import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CreateBudgetSchema, UpdateBudgetSchema } from '@cardledger/shared';

export async function budgetRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req) => {
    const userId = req.user.sub;
    return db.select().from(budgets).where(eq(budgets.user_id, userId));
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateBudgetSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const [budget] = await db
      .insert(budgets)
      .values({
        user_id: userId,
        category: parsed.data.category,
        limit_amount: String(parsed.data.limit_amount),
      })
      .returning();
    return reply.status(201).send(budget);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateBudgetSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const update: any = {};
    if (parsed.data.category) update.category = parsed.data.category;
    if (parsed.data.limit_amount !== undefined)
      update.limit_amount = String(parsed.data.limit_amount);

    const [budget] = await db
      .update(budgets)
      .set(update)
      .where(and(eq(budgets.id, req.params.id), eq(budgets.user_id, userId)))
      .returning();

    if (!budget) return reply.status(404).send({ error: 'Not found' });
    return budget;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [deleted] = await db
      .delete(budgets)
      .where(and(eq(budgets.id, req.params.id), eq(budgets.user_id, userId)))
      .returning({ id: budgets.id });

    if (!deleted) return reply.status(404).send({ error: 'Not found' });
    return reply.status(204).send();
  });
}
