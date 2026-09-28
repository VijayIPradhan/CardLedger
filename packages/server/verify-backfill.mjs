import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function verifyBackfill() {
  try {
    console.log('=== Verification: Transactions with payments_received > 0 ===\n');

    const result = await pool.query(`
      SELECT
        t.id,
        c.nickname as card,
        t.merchant,
        t.amount::numeric as amount,
        t.payments_received::numeric,
        t.is_paid,
        t.txn_date
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      WHERE t.payments_received > 0
      ORDER BY t.is_paid DESC, t.txn_date
    `);

    console.table(result.rows);

    console.log('\n=== Summary ===');
    const paid = result.rows.filter(r => r.is_paid).length;
    const unpaid = result.rows.filter(r => !r.is_paid).length;
    console.log(`Total with payments_received: ${result.rows.length}`);
    console.log(`  Fully paid (is_paid=true): ${paid}`);
    console.log(`  Partially paid (is_paid=false): ${unpaid}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

verifyBackfill();
