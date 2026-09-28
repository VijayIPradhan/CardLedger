import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'fs/promises';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });

async function runMigration(filepath) {
  console.log(`\nRunning migration: ${filepath}`);
  const sql = await readFile(filepath, 'utf-8');

  try {
    await pool.query(sql);
    console.log(`✅ Migration complete: ${filepath}`);
  } catch (error) {
    console.error(`❌ Migration failed: ${filepath}`);
    console.error(error.message);
    throw error;
  }
}

async function main() {
  try {
    await runMigration('drizzle/0018_add_notification_system.sql');
    await runMigration('drizzle/0019_add_billing_cycles.sql');
    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
