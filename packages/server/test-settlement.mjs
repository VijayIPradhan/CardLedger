import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function testSettlement() {
  try {
    console.log('\n=== BEFORE SETTLEMENT ===');

    // Check unsettled transactions
    const before = await pool.query(`
      SELECT
        c.nickname as card,
        t.id,
        t.merchant,
        t.amount::numeric,
        t.is_paid,
        t.txn_date
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      WHERE t.is_paid = false
      ORDER BY c.nickname, t.txn_date
      LIMIT 20
    `);
    console.table(before.rows);

    console.log('\n=== CARD PAYMENTS WITH SETTLED TRANSACTIONS ===');

    // Check card_payments with settled_transactions
    const payments = await pool.query(`
      SELECT
        cp.id,
        c.nickname as card,
        h.name as funded_by,
        cp.amount::numeric,
        cp.payment_date,
        cp.settled_transactions
      FROM card_payments cp
      JOIN cards c ON cp.card_id = c.id
      JOIN holders h ON cp.holder_id = h.id
      WHERE cp.settled_transactions IS NOT NULL
      ORDER BY cp.payment_date DESC
      LIMIT 10
    `);
    console.table(payments.rows);

    console.log('\n=== CHECKING SETTLEMENT ACCURACY ===');

    // For each card_payment with settled_transactions, verify the transactions are marked is_paid
    for (const payment of payments.rows) {
      if (!payment.settled_transactions) continue;

      console.log(`\nCard Payment ${payment.id} (${payment.card}, ₹${payment.amount}):`);

      for (const settled of payment.settled_transactions) {
        const [txn] = await pool.query(
          `SELECT id, merchant, amount::numeric, is_paid FROM transactions WHERE id = $1`,
          [settled.transaction_id]
        );

        if (txn.rows.length > 0) {
          const t = txn.rows[0];
          console.log(`  ✓ ${t.id} - ${t.merchant} - ₹${t.amount} - is_paid: ${t.is_paid} - settled: ₹${settled.amount}`);

          if (!t.is_paid && settled.amount >= parseFloat(t.amount)) {
            console.log(`    ⚠️  WARNING: Transaction should be marked is_paid=true!`);
          }
        }
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

testSettlement();
