import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// POST/PATCH/DELETE /card-payments: one request per payment; the server splits it, enforces
// the allocation rules and recomputes settlement in one DB transaction.

let app: FastifyInstance;
let token: string;
let cardId: string;
let otherCardId: string;
let friendSpend: string;
const headers = () => ({ authorization: `Bearer ${token}` });

async function spend(card: string, amount: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/transactions',
    headers: headers(),
    payload: {
      card_id: card,
      amount,
      merchant: 'Shop',
      txn_date: '2026-09-20',
      source: 'manual',
      type: 'spend',
    },
  });
  return res.json().id as string;
}

async function txn(id: string) {
  const res = await app.inject({ method: 'GET', url: `/transactions/${id}`, headers: headers() });
  return res.json() as { is_paid: boolean; payments_received: string };
}

const pay = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/card-payments',
    headers: headers(),
    payload: { card_id: cardId, payment_date: '2026-09-28', ...payload },
  });

async function newCard(nickname: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/cards',
    headers: headers(),
    payload: {
      last4: '5555',
      network: 'Visa',
      bank: 'HDFC',
      nickname,
      billing_cycle_day: 5,
      payment_due_day: 25,
      credit_limit: 100000,
    },
  });
  return res.json().id as string;
}

beforeAll(async () => {
  process.env.POSTGRES_URL =
    process.env.POSTGRES_URL ?? 'postgresql://cardledger:cardledger@localhost:5432/cardledger';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-32-chars-minimum!!xx';
  const { buildApp } = await import('../app.js');
  app = await buildApp();
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin', password: 'changeme123' },
  });
  token = login.json().token;
  cardId = await newCard('Card Payments Test');
  otherCardId = await newCard('Card Payments Other');
  friendSpend = await spend(otherCardId, 100);
}, 60000);

afterAll(async () => {
  await app.close();
});

describe('POST /card-payments', () => {
  it('splits one payment across the selected transactions, in one request', async () => {
    const lic = await spend(cardId, 14321.6);
    const oppo = await spend(cardId, 8481.4);
    const res = await pay({ amount: 22803, transaction_ids: [lic, oppo] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      type: 'bill_payment',
      amount: '22803.00',
      unallocated_amount: '0',
      allocations: [
        { transaction_id: lic, amount: '14321.60' },
        { transaction_id: oppo, amount: '8481.40' },
      ],
    });
    expect(await txn(lic)).toMatchObject({ is_paid: true, payments_received: '14321.60' });
    expect(await txn(oppo)).toMatchObject({ is_paid: true, payments_received: '8481.40' });

    const card = await app.inject({ method: 'GET', url: `/cards/${cardId}`, headers: headers() });
    expect(parseFloat(card.json().current_spend)).toBe(0);
  });

  it('leaves an overpayment unallocated instead of over-settling a transaction', async () => {
    const t = await spend(cardId, 1000);
    const res = await pay({ amount: 1500, transaction_ids: [t] });
    expect(res.json()).toMatchObject({
      unallocated_amount: '500',
      allocations: [{ amount: '1000.00' }],
    });
  });

  it('rejects an explicit allocation beyond what the transaction still owes', async () => {
    const t = await spend(cardId, 1000);
    await pay({ amount: 600, allocations: [{ transaction_id: t, amount: 600 }] });
    const res = await pay({ amount: 600, allocations: [{ transaction_id: t, amount: 600 }] });
    expect(res.statusCode).toBe(400);
    expect(await txn(t)).toMatchObject({ is_paid: false, payments_received: '600.00' });
  });

  it('rejects allocations that add up to more than the payment', async () => {
    const t = await spend(cardId, 1000);
    const res = await pay({ amount: 100, allocations: [{ transaction_id: t, amount: 200 }] });
    expect(res.statusCode).toBe(400);
  });

  it("rejects another card's transaction", async () => {
    const res = await pay({ amount: 100, transaction_ids: [friendSpend] });
    expect(res.statusCode).toBe(400);
  });

  it('two payments made at once cannot both claim the same balance', async () => {
    const t = await spend(cardId, 1000);
    const [a, b] = await Promise.all([
      pay({ amount: 1000, allocations: [{ transaction_id: t, amount: 1000 }] }),
      pay({ amount: 1000, allocations: [{ transaction_id: t, amount: 1000 }] }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 400]);
    expect(await txn(t)).toMatchObject({ is_paid: true, payments_received: '1000.00' });
  });
});

describe('PATCH and DELETE /card-payments/:id', () => {
  it('replaces allocations and resettles both the old and new transactions', async () => {
    const t1 = await spend(cardId, 300);
    const t2 = await spend(cardId, 300);
    const created = (await pay({ amount: 300, transaction_ids: [t1] })).json();
    expect(await txn(t1)).toMatchObject({ is_paid: true });

    const res = await app.inject({
      method: 'PATCH',
      url: `/card-payments/${created.id}`,
      headers: headers(),
      payload: { allocations: [{ transaction_id: t2, amount: 300 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(await txn(t1)).toMatchObject({ is_paid: false, payments_received: '0.00' });
    expect(await txn(t2)).toMatchObject({ is_paid: true, payments_received: '300.00' });

    const del = await app.inject({
      method: 'DELETE',
      url: `/card-payments/${created.id}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(204);
    expect(await txn(t2)).toMatchObject({ is_paid: false, payments_received: '0.00' });
    const gone = await app.inject({
      method: 'GET',
      url: `/card-payments/${created.id}`,
      headers: headers(),
    });
    expect(gone.statusCode).toBe(404);
  });

  it("cannot touch another user's payment", async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/card-payments/00000000-0000-0000-0000-000000000000',
      headers: headers(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('editing a spend amount', () => {
  it('resettles it against the payments already made', async () => {
    const t = await spend(cardId, 500);
    await pay({ amount: 400, transaction_ids: [t] });
    expect(await txn(t)).toMatchObject({ is_paid: false });
    await app.inject({
      method: 'PATCH',
      url: `/transactions/${t}`,
      headers: headers(),
      payload: { amount: 400 },
    });
    expect(await txn(t)).toMatchObject({ is_paid: true, payments_received: '400.00' });
  });
});
