import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Phase 2: one card_payments row per payment, card_payment_allocations as the source of truth
// for what it settles, and payments_received / is_paid recomputed from the allocations.

let app: FastifyInstance;
let token: string;
let db: typeof import('../db/index.js').db;
let cardId: string;
let otherCardId: string;
const spends: string[] = [];

const headers = () => ({ authorization: `Bearer ${token}` });

async function post(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/transactions',
    headers: headers(),
    payload,
  });
  // Spends answer 201; bill payments take an older path that answers 200.
  expect([200, 201]).toContain(res.statusCode);
  return res.json() as { id: string };
}

async function allocationsOf(paymentId: string) {
  const { sql } = await import('drizzle-orm');
  const res = await db.execute(sql`
    SELECT transaction_id, amount::text AS amount FROM card_payment_allocations
    WHERE card_payment_id = ${paymentId} ORDER BY card_payment_allocations.amount`);
  return res.rows as Array<{ transaction_id: string; amount: string }>;
}

async function settlementOf(txnId: string) {
  const { sql } = await import('drizzle-orm');
  const res = await db.execute(sql`
    SELECT payments_received::text AS received, is_paid FROM transactions WHERE id = ${txnId}`);
  return res.rows[0] as { received: string; is_paid: boolean };
}

async function billRows() {
  const res = await app.inject({
    method: 'GET',
    url: `/transactions?card_id=${cardId}`,
    headers: headers(),
  });
  return (res.json() as Array<Record<string, unknown>>).filter((t) => t.type === 'bill_payment');
}

const bill = (amount: number, extra: Record<string, unknown> = {}) => ({
  card_id: cardId,
  amount,
  merchant: 'Payment to Bank',
  txn_date: '2026-09-28',
  source: 'manual',
  type: 'bill_payment',
  ...extra,
});

async function newCard(nickname: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/cards',
    headers: headers(),
    payload: {
      last4: '7777',
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
  ({ db } = await import('../db/index.js'));
  app = await buildApp();
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin', password: 'changeme123' },
  });
  token = login.json().token;

  cardId = await newCard('Allocation Test');
  otherCardId = await newCard('Other Card');
  for (const amount of [1000, 2000, 500]) {
    const s = await post({
      card_id: cardId,
      amount,
      merchant: 'Shop',
      txn_date: '2026-09-20',
      source: 'manual',
      type: 'spend',
    });
    spends.push(s.id);
  }
}, 60000);

afterAll(async () => {
  await app.close();
});

describe('bill payments with allocations', () => {
  let paymentId: string;

  it('an old-client split (payment then shares) is stored as one payment with allocations', async () => {
    paymentId = (await post(bill(3500))).id;
    await post(bill(1000, { linked_transaction_id: spends[0], parent_payment_id: paymentId }));
    await post(bill(2000, { linked_transaction_id: spends[1], parent_payment_id: paymentId }));
    await post(bill(500, { parent_payment_id: paymentId })); // the "Unallocated" rest

    expect(await allocationsOf(paymentId)).toEqual([
      { transaction_id: spends[0], amount: '1000.00' },
      { transaction_id: spends[1], amount: '2000.00' },
    ]);
    expect(await settlementOf(spends[0])).toEqual({ received: '1000.00', is_paid: true });
    expect(await settlementOf(spends[1])).toEqual({ received: '2000.00', is_paid: true });

    const rows = await billRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: paymentId, amount: '3500.00', unallocated_amount: '500' });
  });

  it('the card balance counts the payment once', async () => {
    const res = await app.inject({ method: 'GET', url: `/cards/${cardId}`, headers: headers() });
    // Unpaid spend 500, less the 500 unallocated: settled spend is not subtracted twice.
    expect(parseFloat(res.json().current_spend)).toBe(0);
  });

  it('a payment cannot be edited below what it has allocated', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/transactions/${paymentId}`,
      headers: headers(),
      payload: { amount: 2500 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deleting the payment unsettles what it paid for', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/transactions/${paymentId}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(await allocationsOf(paymentId)).toEqual([]);
    expect(await settlementOf(spends[0])).toEqual({ received: '0.00', is_paid: false });
    expect(await billRows()).toHaveLength(0);
  });

  it('a linked payment moves with its link and amount', async () => {
    const linked = await post(bill(500, { linked_transaction_id: spends[2] }));
    expect(await settlementOf(spends[2])).toEqual({ received: '500.00', is_paid: true });

    let res = await app.inject({
      method: 'PATCH',
      url: `/transactions/${linked.id}`,
      headers: headers(),
      payload: { linked_transaction_id: spends[1] },
    });
    expect(res.statusCode).toBe(200);
    expect(await allocationsOf(linked.id)).toEqual([
      { transaction_id: spends[1], amount: '500.00' },
    ]);
    expect(await settlementOf(spends[2])).toEqual({ received: '0.00', is_paid: false });
    expect(await settlementOf(spends[1])).toEqual({ received: '500.00', is_paid: false });

    res = await app.inject({
      method: 'PATCH',
      url: `/transactions/${linked.id}`,
      headers: headers(),
      payload: { amount: 2000 },
    });
    expect(res.statusCode).toBe(200);
    expect(await settlementOf(spends[1])).toEqual({ received: '2000.00', is_paid: true });

    await app.inject({ method: 'DELETE', url: `/transactions/${linked.id}`, headers: headers() });
  });

  it('a transaction marked paid by hand stays paid when a payment against it is removed', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/transactions/${spends[2]}`,
      headers: headers(),
      payload: { is_paid: true },
    });
    const partial = await post(bill(100, { linked_transaction_id: spends[2] }));
    await app.inject({ method: 'DELETE', url: `/transactions/${partial.id}`, headers: headers() });
    expect(await settlementOf(spends[2])).toEqual({ received: '0.00', is_paid: true });
  });

  it('rejects links to another card', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/transactions',
      headers: headers(),
      payload: bill(100, { card_id: otherCardId, linked_transaction_id: spends[0] }),
    });
    expect(res.statusCode).toBe(400);
  });
});
