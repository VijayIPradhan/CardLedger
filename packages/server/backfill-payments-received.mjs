import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function backfillPaymentsReceived() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('=== Backfilling payments_received for unpaid transactions ===\n');

    // Find all unpaid transactions with card_payments
    const result = await client.query(`
      SELECT
        t.id as transaction_id,
        t.amount as txn_amount,
        t.is_paid,
        COALESCE(SUM(cp.amount), 0) as total_card_payments
      FROM transactions t
      LEFT JOIN card_payments cp ON cp.transaction_id = t.id
      WHERE t.is_paid = false
      GROUP BY t.id, t.amount, t.is_paid
      HAVING COALESCE(SUM(cp.amount), 0) > 0
      ORDER BY t.txn_date
    `);

    console.log(`Found ${result.rows.length} unpaid transactions with card_payments\n`);

    let updated = 0;
    let markedPaid = 0;

    for (const row of result.rows) {
      const txnAmount = parseFloat(row.txn_amount);
      const paymentsReceived = parseFloat(row.total_card_payments);
      const shouldBePaid = paymentsReceived >= txnAmount;

      console.log(`Transaction ${row.transaction_id}:`);
      console.log(`  Amount: ₹${txnAmount}`);
      console.log(`  Card Payments: ₹${paymentsReceived}`);
      console.log(`  Will mark as paid: ${shouldBePaid ? 'YES' : 'NO'}`);

      await client.query(
        `UPDATE transactions
         SET payments_received = $1, is_paid = $2
         WHERE id = $3`,
        [paymentsReceived, shouldBePaid, row.transaction_id]
      );

      updated++;
      if (shouldBePaid) markedPaid++;
    }

    await client.query('COMMIT');

    console.log(`\n=== COMPLETE ===`);
    console.log(`Updated: ${updated} transactions`);
    console.log(`Marked as paid: ${markedPaid} transactions`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillPaymentsReceived();
