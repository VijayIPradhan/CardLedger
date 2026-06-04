import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool);
await migrate(db, { migrationsFolder: './drizzle' });
await pool.end();
console.log('Migrations complete');
