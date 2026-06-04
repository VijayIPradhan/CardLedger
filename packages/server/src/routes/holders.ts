import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { holders } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { CreateHolderSchema, UpdateHolderSchema } from '@cardledger/shared';

export async function holderRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async () => {
    return db.select().from(holders).orderBy(holders.name);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [h] = await db.select().from(holders).where(eq(holders.id, req.params.id));
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db.insert(holders).values(parsed.data).returning();
    return reply.status(201).send(h);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db
      .update(holders)
      .set(parsed.data)
      .where(eq(holders.id, req.params.id))
      .returning();
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });
}
