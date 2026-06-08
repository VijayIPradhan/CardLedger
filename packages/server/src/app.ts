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
import { paymentRoutes } from './routes/payments.js';
import { metadataRoutes } from './routes/metadata.js';
import { smsRoutes } from './routes/sms.js';

const isTest = process.env.NODE_ENV === 'test';

export async function buildApp() {
  const app = Fastify({
    logger: isTest
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
          // JSON in production (structured logs); readable serializers for requests
          serializers: {
            req(req) {
              return { method: req.method, url: req.url, ip: req.ip };
            },
            res(res) {
              return { statusCode: res.statusCode };
            },
          },
        },
  });

  // Global error handler — logs full error before sending 500
  app.setErrorHandler((err, req, reply) => {
    app.log.error({ err, method: req.method, url: req.url }, 'Unhandled error');
    const status = err.statusCode ?? 500;
    reply.status(status).send({
      error: status < 500 ? err.message : 'Internal Server Error',
    });
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyRateLimit, {
    max: 5000,
    timeWindow: '1 minute',
  });
  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(cardRoutes, { prefix: '/cards' });
  await app.register(holderRoutes, { prefix: '/holders' });
  await app.register(assignmentRoutes, { prefix: '/assignments' });
  await app.register(transactionRoutes, { prefix: '/transactions' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(metadataRoutes, { prefix: '/metadata' });
  await app.register(smsRoutes, { prefix: '/sms' });

  return app;
}
