import { db, pool } from './src/db/index.js';
import { cards, holders, transactions, payments } from './src/db/schema.js';

async function main() {
  const allCards = await db.select().from(cards);
  console.log('--- CARDS ---');
  for (const c of allCards) {
    console.log(
      `Card: id=${c.id}, name=${c.card_name}, limit=${c.credit_limit}, current_spend=${c.current_spend}, shared_limit_with=${c.shared_limit_with}`,
    );
  }

  const allHolders = await db.select().from(holders);
  console.log('--- HOLDERS ---');
  for (const h of allHolders) {
    console.log(`Holder: id=${h.id}, name=${h.name}, rel=${h.relationship}`);
  }

  const allPayments = await db.select().from(payments);
  console.log('--- PAYMENTS ---');
  for (const p of allPayments) {
    const h = allHolders.find((x) => x.id === p.holder_id);
    console.log(
      `Payment: id=${p.id}, holder=${h?.name} (${p.holder_id}), amount=${p.amount}, date=${p.payment_date}, txn_id=${p.transaction_id}`,
    );
  }

  const allTxns = await db.select().from(transactions);
  console.log('--- FRIEND TRANSACTIONS (type=spend vs payment) ---');
  const friends = allHolders.filter((h) => h.relationship === 'friend');
  for (const f of friends) {
    const fTxns = allTxns.filter((t) => t.holder_id_at_time === f.id);
    console.log(`\nFriend: ${f.name} (id=${f.id}) has ${fTxns.length} txns:`);
    let totalSpend = 0;
    let totalPaidInTxns = 0;
    for (const t of fTxns) {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'spend') {
        totalSpend += amt;
      } else {
        totalPaidInTxns += amt;
      }
      console.log(
        `  Txn: id=${t.id}, card=${allCards.find((c) => c.id === t.card_id)?.card_name}, amount=${t.amount}, type=${t.type}, is_paid=${t.is_paid}, date=${t.txn_date}, desc=${t.merchant}`,
      );
    }
    const pAmt = allPayments
      .filter((p) => p.holder_id === f.id)
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    console.log(
      `  SUMMARY for ${f.name}: totalSpend(type=spend)=${totalSpend}, totalRefunds/txnPayments(type=payment)=${totalPaidInTxns}, paymentsTable=${pAmt}`,
    );
  }

  await pool.end();
}
main();
