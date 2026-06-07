import type { FastifyInstance } from 'fastify';
import { banksData } from '../data/banks.js';

export async function metadataRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/banks', auth, async (req, reply) => {
    try {
      return reply.send(banksData);
    } catch (e) {
      req.log.error(e);
      return reply.status(500).send({ error: 'Failed to load metadata' });
    }
  });
}
