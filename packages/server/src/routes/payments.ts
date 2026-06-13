import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { payments, holders } from '../db/schema.js';
import { eq, and, getTableColumns } from 'drizzle-orm';
import { CreatePaymentSchema, UpdatePaymentSchema } from '@cardledger/shared';

export async function paymentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { holder_id?: string } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { holder_id } = req.query;

    const conditions: ReturnType<typeof eq>[] = [eq(holders.user_id, userId)];
    if (holder_id) conditions.push(eq(payments.holder_id, holder_id));

    return db
      .select({ ...getTableColumns(payments) })
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(and(...conditions))
      .orderBy(payments.payment_date);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [p] = await db
      .select({ ...getTableColumns(payments) })
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(and(eq(payments.id, req.params.id), eq(holders.user_id, userId)));
    if (!p) return reply.status(404).send({ error: 'Not found' });
    return p;
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify the target holder belongs to this user
    const [holder] = await db
      .select({ id: holders.id })
      .from(holders)
      .where(and(eq(holders.id, parsed.data.holder_id), eq(holders.user_id, userId)));
    if (!holder) return reply.status(404).send({ error: 'Holder not found' });

    const { amount, transaction_id, ...rest } = parsed.data;
    const [p] = await db
      .insert(payments)
      .values({ ...rest, transaction_id: transaction_id ?? null, amount: String(amount) })
      .returning();
    return reply.status(201).send(p);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdatePaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify ownership via holder join
    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(and(eq(payments.id, req.params.id), eq(holders.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const { amount, ...rest } = parsed.data;
    const update = amount !== undefined ? { ...rest, amount: String(amount) } : rest;
    const [p] = await db
      .update(payments)
      .set(update)
      .where(eq(payments.id, req.params.id))
      .returning();
    return p;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(and(eq(payments.id, req.params.id), eq(holders.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    await db.delete(payments).where(eq(payments.id, req.params.id));
    return reply.status(204).send();
  });

  app.delete<{ Params: { txnId: string } }>('/transaction/:txnId', auth, async (req, reply) => {
    const userId = req.user.sub;

    // Verify the payment belongs to a holder owned by this user
    const existing = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(and(eq(payments.transaction_id, req.params.txnId), eq(holders.user_id, userId)));

    if (existing.length === 0) return reply.status(404).send({ error: 'Not found' });

    await db.delete(payments).where(eq(payments.transaction_id, req.params.txnId));
    return reply.status(204).send();
  });
}
