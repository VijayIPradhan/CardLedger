import 'dotenv/config';
import { buildApp } from './app.js';
import { seed } from './db/seed.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db/index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await migrate(db, { migrationsFolder: resolve(__dirname, '../drizzle') });
console.log('Migrations complete');

const app = await buildApp();
await seed();
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
console.log(`Server listening on port ${process.env.PORT ?? 3001}`);

process.on('SIGTERM', async () => {
  await app.close();
  await pool.end();
  process.exit(0);
});
