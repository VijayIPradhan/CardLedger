import 'dotenv/config';
import { buildApp } from './app.js';
import { seed } from './db/seed.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db/index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await migrate(db, { migrationsFolder: resolve(__dirname, '../drizzle') });

const app = await buildApp();
app.log.info('Migrations complete');

await seed();
app.log.info('Seed complete');

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
// Fastify pino logs the address automatically — no extra console.log needed

process.on('SIGTERM', async () => {
  app.log.info('SIGTERM received — shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
});
