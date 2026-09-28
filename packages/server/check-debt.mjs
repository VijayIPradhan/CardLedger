import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function checkDebt() {
  try {
    // Get holders
    const holdersRes = await pool.query(
      `SELECT id, name, relationship FROM holders ORDER BY relationship, name`
    );
    console.log('\n=== HOLDERS ===');
    console.table(holdersRes.rows);

    // Get transactions summary
    const txnsRes = await pool.query(`
      SELECT
        h.name as holder,
        h.relationship,
        COUNT(*) as txn_count,
        SUM(CASE WHEN t.type = 'spend' THEN t.amount::numeric ELSE 0 END) as total_spend,
        SUM(CASE WHEN t.type = 'refund' THEN t.amount::numeric ELSE 0 END) as total_refunds,
        SUM(CASE WHEN t.is_paid = true AND t.type = 'spend' THEN t.amount::numeric
                 WHEN t.is_paid = true AND t.type = 'refund' THEN -t.amount::numeric
                 ELSE 0 END) as settled_amount,
        SUM(CASE WHEN t.is_paid = false AND t.type = 'spend' THEN t.amount::numeric
                 WHEN t.is_paid = false AND t.type = 'refund' THEN -t.amount::numeric
                 ELSE 0 END) as unsettled_amount
      FROM transactions t
      JOIN holders h ON t.holder_id_at_time = h.id
      GROUP BY h.id, h.name, h.relationship
      ORDER BY h.relationship, h.name
    `);
    console.log('\n=== TRANSACTIONS BY HOLDER ===');
    console.table(txnsRes.rows);

    // Get payments (cash from friends)
    const paymentsRes = await pool.query(`
      SELECT
        h.name as holder,
        h.relationship,
        COUNT(*) as payment_count,
        SUM(p.amount::numeric) as total_paid
      FROM payments p
      JOIN holders h ON p.holder_id = h.id
      GROUP BY h.id, h.name, h.relationship
      ORDER BY h.relationship, h.name
    `);
    console.log('\n=== PAYMENTS (Cash from Friends) ===');
    console.table(paymentsRes.rows);

    // Get card payments
    const cardPaymentsRes = await pool.query(`
      SELECT
        cp.id,
        c.nickname as card,
        h.name as funded_by,
        h.relationship,
        cp.amount::numeric,
        cp.payment_date,
        cp.notes
      FROM card_payments cp
      JOIN cards c ON cp.card_id = c.id
      JOIN holders h ON cp.holder_id = h.id
      ORDER BY cp.payment_date DESC
    `);
    console.log('\n=== CARD PAYMENTS (Bills Paid to Bank) ===');
    console.table(cardPaymentsRes.rows);

    // Calculate manually
    console.log('\n=== MANUAL CALCULATION ===');

    const friendSpendRes = await pool.query(`
      SELECT
        SUM(CASE WHEN t.type = 'spend' THEN t.amount::numeric
                 WHEN t.type = 'refund' THEN -t.amount::numeric ELSE 0 END) as friend_total_spend
      FROM transactions t
      JOIN holders h ON t.holder_id_at_time = h.id
      WHERE h.relationship = 'friend'
    `);

    const friendPaidRes = await pool.query(`
      SELECT SUM(p.amount::numeric) as friend_total_paid
      FROM payments p
      JOIN holders h ON p.holder_id = h.id
      WHERE h.relationship = 'friend'
    `);

    const friendSettledRes = await pool.query(`
      SELECT
        SUM(CASE WHEN t.type = 'spend' THEN t.amount::numeric
                 WHEN t.type = 'refund' THEN -t.amount::numeric ELSE 0 END) as friend_total_settled
      FROM transactions t
      JOIN holders h ON t.holder_id_at_time = h.id
      WHERE h.relationship = 'friend' AND t.is_paid = true
    `);

    const friendTotalSpend = parseFloat(friendSpendRes.rows[0].friend_total_spend || 0);
    const friendTotalPaid = parseFloat(friendPaidRes.rows[0].friend_total_paid || 0);
    const friendTotalSettled = parseFloat(friendSettledRes.rows[0].friend_total_settled || 0);

    console.log(`Friend Total Spend: ${friendTotalSpend}`);
    console.log(`Friend Total Paid (cash received): ${friendTotalPaid}`);
    console.log(`Friend Total Settled (is_paid=true): ${friendTotalSettled}`);

    // Get unsettled spend by card
    const unsettledByCardRes = await pool.query(`
      SELECT
        c.nickname as card,
        SUM(CASE WHEN t.type = 'spend' THEN t.amount::numeric
                 WHEN t.type = 'refund' THEN -t.amount::numeric ELSE 0 END) as unsettled
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      JOIN holders h ON t.holder_id_at_time = h.id
      WHERE h.relationship = 'friend' AND t.is_paid = false
      GROUP BY c.id, c.nickname
      ORDER BY c.nickname
    `);
    console.log('\n=== UNSETTLED SPEND BY CARD ===');
    console.table(unsettledByCardRes.rows);

    // Calculate friendTotalForwarded
    console.log('\n=== CARD PAYMENTS APPLIED TO UNSETTLED ===');
    let friendTotalForwarded = 0;

    for (const row of cardPaymentsRes.rows) {
      const cardName = row.card;
      const amount = parseFloat(row.amount);
      const fundedBy = row.funded_by;
      const relationship = row.relationship;

      const unsettledRow = unsettledByCardRes.rows.find(u => u.card === cardName);
      const unsettled = unsettledRow ? parseFloat(unsettledRow.unsettled) : 0;

      const counted = Math.min(Math.max(0, unsettled), amount);
      friendTotalForwarded += counted;

      console.log(`  ${cardName} - ${fundedBy} (${relationship}): paid ${amount}, unsettled ${unsettled}, counted ${counted}`);
    }

    console.log(`\nFriend Total Forwarded (card payments): ${friendTotalForwarded}`);

    const friendAdvanceInHand = friendTotalPaid - friendTotalSettled - friendTotalForwarded;
    console.log(`\nAdvance In Hand = ${friendTotalPaid} - ${friendTotalSettled} - ${friendTotalForwarded} = ${friendAdvanceInHand}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkDebt();
