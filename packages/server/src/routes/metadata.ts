import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function metadataRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/banks', auth, async (req, reply) => {
    try {
      const data = readFileSync(join(__dirname, '../data/banks.json'), 'utf-8');
      const parsed = JSON.parse(data);
      return reply.send(parsed);
    } catch (e) {
      req.log.error(e);
      return reply.status(500).send({ error: 'Failed to load metadata' });
    }
  });
}
