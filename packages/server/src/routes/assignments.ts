import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { assignments, cards } from '../db/schema.js';
import { eq, and, isNull, getTableColumns } from 'drizzle-orm';
import { CreateAssignmentSchema, UpdateAssignmentSchema } from '@cardledger/shared';

export async function assignmentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string; active?: string } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { card_id, active } = req.query;

    const conditions: ReturnType<typeof eq>[] = [eq(cards.user_id, userId)];
    if (card_id) conditions.push(eq(assignments.card_id, card_id));
    if (active === 'true') conditions.push(isNull(assignments.returned_date));

    return db
      .select({ ...getTableColumns(assignments) })
      .from(assignments)
      .innerJoin(cards, eq(assignments.card_id, cards.id))
      .where(and(...conditions));
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify the target card belongs to this user
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.id, parsed.data.card_id), eq(cards.user_id, userId)));
    if (!card) return reply.status(404).send({ error: 'Card not found' });

    const [a] = await db.insert(assignments).values(parsed.data).returning();
    return reply.status(201).send(a);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify ownership via card join
    const [existing] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(cards, eq(assignments.card_id, cards.id))
      .where(and(eq(assignments.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const [a] = await db
      .update(assignments)
      .set(parsed.data)
      .where(eq(assignments.id, req.params.id))
      .returning();
    return a;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    const [existing] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .innerJoin(cards, eq(assignments.card_id, cards.id))
      .where(and(eq(assignments.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    await db.delete(assignments).where(eq(assignments.id, req.params.id));
    return reply.status(204).send();
  });
}
