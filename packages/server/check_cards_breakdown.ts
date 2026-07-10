import { db, pool } from './src/db/index.js';
import { cards, holders, transactions, payments } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const allCards = await db.select().from(cards);
  const allHolders = await db.select().from(holders);
  const allTxns = await db.select().from(transactions);
  const allPayments = await db.select().from(payments);

  console.log('=== CARD BREAKDOWN ===');
  for (const c of allCards) {
    const cardTxns = allTxns.filter((t) => t.card_id === c.id);
    const unpaidSpendTxns = cardTxns.filter((t) => !t.is_paid && t.type === 'spend');
    const unpaidTotal = unpaidSpendTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    const paidSpendTxns = cardTxns.filter((t) => t.is_paid && t.type === 'spend');
    const paidTotal = paidSpendTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    console.log(`\nCard: ${c.card_name} (id=${c.id})`);
    console.log(`  current_spend (DB col): ${c.current_spend}`);
    console.log(`  Unpaid spend txns total: ${unpaidTotal.toFixed(2)}`);
    console.log(`  Paid spend txns total: ${paidTotal.toFixed(2)}`);

    // Break down by holder for unpaid
    console.log(`  -- Holders on UNPAID txns --`);
    for (const h of allHolders) {
      const hTxns = unpaidSpendTxns.filter((t) => t.holder_id_at_time === h.id);
      if (hTxns.length > 0) {
        const sum = hTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
        console.log(
          `     Holder: ${h.name} (${h.relationship}): ${sum.toFixed(2)} (count=${hTxns.length})`,
        );
        for (const t of hTxns) {
          console.log(`        [${t.txn_date}] ${t.merchant}: ${t.amount} (is_paid=${t.is_paid})`);
        }
      }
    }
  }

  await pool.end();
}
main();
