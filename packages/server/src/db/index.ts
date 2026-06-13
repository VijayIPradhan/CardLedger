import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.POSTGRES_URL;

if (connectionString) {
  try {
    const parsed = new URL(connectionString);
    if (parsed.password) {
      parsed.password = '***';
    }
    console.log(`[DB] Connecting to Postgres at: ${parsed.href}`);
  } catch (err) {
    console.log('[DB] Connecting to Postgres (invalid URL format)');
  }
} else {
  console.log('[DB] WARNING: POSTGRES_URL environment variable is not set!');
}

const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
export { pool };
