import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { payments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CreatePaymentSchema, UpdatePaymentSchema } from '@cardledger/shared';

export async function paymentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { holder_id?: string } }>('/', auth, async (req) => {
    const { holder_id } = req.query;
    const conditions = [];
    if (holder_id) conditions.push(eq(payments.holder_id, holder_id));
    return db
      .select()
      .from(payments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(payments.payment_date);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [p] = await db.select().from(payments).where(eq(payments.id, req.params.id));
    if (!p) return reply.status(404).send({ error: 'Not found' });
    return p;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { amount, ...rest } = parsed.data;
    const [p] = await db
      .insert(payments)
      .values({ ...rest, amount: String(amount) })
      .returning();
    return reply.status(201).send(p);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { amount, ...rest } = parsed.data;
    const update = amount !== undefined ? { ...rest, amount: String(amount) } : rest;

    const [p] = await db
      .update(payments)
      .set(update)
      .where(eq(payments.id, req.params.id))
      .returning();
    if (!p) return reply.status(404).send({ error: 'Not found' });
    return p;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    await db.delete(payments).where(eq(payments.id, req.params.id));
    return reply.status(204).send();
  });
}
