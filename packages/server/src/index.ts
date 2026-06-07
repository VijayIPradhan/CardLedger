import 'dotenv/config';
import { buildApp } from './app.js';
import { seed } from './db/seed.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db/index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Retry DB connection with exponential backoff — avoids crash-loop when
// Postgres passes pg_isready but auth isn't fully initialised yet.
async function migrateWithRetry(migrationsFolder: string, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delayMs = Math.min(1000 * attempt, 8000); // 1s, 2s, 3s … 8s cap
      console.error(
        `DB connect failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms…`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

await migrateWithRetry(resolve(__dirname, '../drizzle'));

const app = await buildApp();
app.log.info('Migrations complete');

await seed(app.log);
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
