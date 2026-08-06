import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { card_payments, cards, users } from '../db/schema.js';
import { eq, and, getTableColumns } from 'drizzle-orm';
import { CreateCardPaymentSchema, UpdateCardPaymentSchema } from '@cardledger/shared';

export async function cardPaymentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { card_id } = req.query;

    const conditions: ReturnType<typeof eq>[] = [eq(cards.user_id, userId)];
    if (card_id) conditions.push(eq(card_payments.card_id, card_id));

    return db
      .select({ ...getTableColumns(card_payments) })
      .from(card_payments)
      .innerJoin(cards, eq(card_payments.card_id, cards.id))
      .where(and(...conditions))
      .orderBy(card_payments.payment_date);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const [p] = await db
      .select({ ...getTableColumns(card_payments) })
      .from(card_payments)
      .innerJoin(cards, eq(card_payments.card_id, cards.id))
      .where(and(eq(card_payments.id, req.params.id), eq(cards.user_id, userId)));
    if (!p) return reply.status(404).send({ error: 'Not found' });
    return p;
  });

  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = CreateCardPaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify the target card belongs to this user
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.id, parsed.data.card_id), eq(cards.user_id, userId)));
    if (!card) return reply.status(404).send({ error: 'Card not found' });

    const { amount, ...rest } = parsed.data;
    const [p] = await db
      .insert(card_payments)
      .values({ ...rest, amount: String(amount) })
      .returning();
    return reply.status(201).send(p);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const parsed = UpdateCardPaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    // Verify ownership via card join
    const [existing] = await db
      .select({ id: card_payments.id })
      .from(card_payments)
      .innerJoin(cards, eq(card_payments.card_id, cards.id))
      .where(and(eq(card_payments.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const { amount, ...rest } = parsed.data;
    const update = amount !== undefined ? { ...rest, amount: String(amount) } : rest;
    const [p] = await db
      .update(card_payments)
      .set(update)
      .where(eq(card_payments.id, req.params.id))
      .returning();
    return p;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    const [existing] = await db
      .select({ id: card_payments.id })
      .from(card_payments)
      .innerJoin(cards, eq(card_payments.card_id, cards.id))
      .where(and(eq(card_payments.id, req.params.id), eq(cards.user_id, userId)));
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    await db.delete(card_payments).where(eq(card_payments.id, req.params.id));
    return reply.status(204).send();
  });
}
