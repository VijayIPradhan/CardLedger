import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  process.env.POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://cardledger:cardledger@localhost:5432/cardledger';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-32-chars-minimum!!xx';
  app = await buildApp();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin', password: 'changeme123' },
  });
  token = res.json().token;
});

afterAll(async () => {
  await app.close();
});

describe('Cards CRUD', () => {
  let cardId: string;

  it('requires auth — returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/cards' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /cards creates a card', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cards',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        last4: '9999',
        network: 'Visa',
        bank: 'HDFC',
        nickname: 'Test HDFC',
        billing_cycle_day: 5,
        payment_due_day: 25,
        credit_limit: 100000,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.last4).toBe('9999');
    cardId = body.id;
    expect(cardId).toBeTruthy();
  });

  it('GET /cards returns list including created card', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/cards',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const cards = res.json();
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.some((c: { id: string }) => c.id === cardId)).toBe(true);
  });

  it('GET /cards/:id returns the card', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(cardId);
  });

  it('PATCH /cards/:id updates nickname', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: 'Updated HDFC' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nickname).toBe('Updated HDFC');
  });

  it('DELETE /cards/:id removes the card', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('GET /cards/:id returns 404 after delete', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
