import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'fs/promises';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });

async function main() {
  const sql = await readFile('drizzle/0020_add_parent_payment_tracking.sql', 'utf-8');
  try {
    await pool.query(sql);
    console.log('✅ Migration 0020_add_parent_payment_tracking applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
