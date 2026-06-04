import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { cardRoutes } from './routes/cards.js';
import { holderRoutes } from './routes/holders.js';
import { assignmentRoutes } from './routes/assignments.js';
import { transactionRoutes } from './routes/transactions.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(cardRoutes, { prefix: '/cards' });
  await app.register(holderRoutes, { prefix: '/holders' });
  await app.register(assignmentRoutes, { prefix: '/assignments' });
  await app.register(transactionRoutes, { prefix: '/transactions' });

  return app;
}
