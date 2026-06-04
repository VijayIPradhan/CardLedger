import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { assignments } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { CreateAssignmentSchema } from '@cardledger/shared';

export async function assignmentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string; active?: string } }>('/', auth, async (req) => {
    const { card_id, active } = req.query;
    const conditions = [];
    if (card_id) conditions.push(eq(assignments.card_id, card_id));
    if (active === 'true') conditions.push(isNull(assignments.returned_date));
    return db
      .select()
      .from(assignments)
      .where(conditions.length ? and(...conditions) : undefined);
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [a] = await db.insert(assignments).values(parsed.data).returning();
    return reply.status(201).send(a);
  });

  app.post<{ Params: { id: string } }>('/:id/return', auth, async (req, reply) => {
    const today = new Date().toISOString().split('T')[0];
    const [a] = await db
      .update(assignments)
      .set({ returned_date: today })
      .where(eq(assignments.id, req.params.id))
      .returning();
    if (!a) return reply.status(404).send({ error: 'Not found' });
    return a;
  });
}
