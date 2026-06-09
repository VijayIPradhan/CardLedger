import type { FastifyInstance } from 'fastify';
import { banksData } from '../data/banks.js';

export async function metadataRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/banks', auth, async (_req, reply) => {
    return reply.send(banksData);
  });
}
