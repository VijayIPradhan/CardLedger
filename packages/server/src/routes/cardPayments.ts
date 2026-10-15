import type { FastifyInstance, FastifyReply } from 'fastify';
import { CreateCardPaymentSchema, UpdateCardPaymentSchema } from '@cardledger/shared';
import {
  CardPaymentError,
  billPaymentRow,
  createCardPayment,
  deleteCardPayment,
  findCardPayment,
  updateCardPayment,
} from '../lib/cardPayments.js';

/**
 * Payments to a card's bank, one request per payment however many transactions it settles.
 * Responses use the same `bill_payment` row shape that GET /transactions lists.
 */
export async function cardPaymentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateCardPaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    return handle(reply, async () =>
      reply.status(201).send(billPaymentRow(await createCardPayment(req.user.sub, parsed.data))),
    );
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const payment = await findCardPayment(req.user.sub, req.params.id);
    if (!payment) return reply.status(404).send({ error: 'Not found' });
    return billPaymentRow(payment);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateCardPaymentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    return handle(reply, async () =>
      billPaymentRow(await updateCardPayment(req.user.sub, req.params.id, parsed.data)),
    );
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    if (!(await deleteCardPayment(req.user.sub, req.params.id))) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.status(204).send();
  });
}

/** Maps a rule violation to its status; anything else is a real error. */
export async function handle<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CardPaymentError) return reply.status(e.status).send({ error: e.message });
    throw e;
  }
}
