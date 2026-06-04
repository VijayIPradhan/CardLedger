import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://cardledger:cardledger@localhost:5432/cardledger';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-32-chars-minimum!!xx';
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /auth/login', () => {
  it('returns 400 for missing body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns token for correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin', password: 'changeme123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
  });
});
