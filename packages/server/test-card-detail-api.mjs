import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';
import { computeCardDetail } from '../shared/dist/domain/cardDetail.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, holders, transactions, payments, card_payments, assignments } = schema;

async function main() {
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  if (!flipkartCards.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const card = flipkartCards[0];

  console.log('\n=== WHAT THE ANDROID APP SHOULD RECEIVE ===\n');
  console.log('From GET /dashboard/card/' + card.id + ':\n');

  const [allHolders, allTxns, allPayments, allCardPayments, allAssignments] = await Promise.all([
    db.select().from(holders),
    db.select().from(transactions),
    db.select().from(payments),
    db.select().from(card_payments),
    db.select().from(assignments),
  ]);

  const input = {
    cardId: card.id,
    billingCycleDay: card.billing_cycle_day,
    holders: allHolders.map(h => ({
      id: h.id,
      name: h.name,
      phone: h.phone || '',
      relationship: h.relationship,
    })),
    transactions: allTxns.map(t => ({
      id: t.id,
      card_id: t.card_id,
      holder_id_at_time: t.holder_id_at_time,
      amount: parseFloat(t.amount),
      type: t.type,
      is_paid: t.is_paid,
      txn_date: t.txn_date instanceof Date ? t.txn_date.toISOString().split('T')[0] : t.txn_date,
      merchant: t.merchant,
    })),
    payments: allPayments.map(p => ({
      id: p.id,
      holder_id: p.holder_id,
      transaction_id: p.transaction_id,
      amount: parseFloat(p.amount),
      payment_date: p.payment_date instanceof Date ? p.payment_date.toISOString().split('T')[0] : p.payment_date,
    })),
    cardPayments: allCardPayments.map(cp => ({
      id: cp.id,
      card_id: cp.card_id,
      holder_id: cp.holder_id,
      transaction_id: cp.transaction_id,
      amount: parseFloat(cp.amount),
      payment_date: cp.payment_date instanceof Date ? cp.payment_date.toISOString().split('T')[0] : cp.payment_date,
    })),
    assignments: allAssignments.map(a => ({
      card_id: a.card_id,
      holder_id: a.holder_id,
      returned_date: a.returned_date,
    })),
    today: new Date().toISOString().split('T')[0],
  };

  const result = computeCardDetail(input);

  console.log('CardDetailDto {');
  console.log('  cardId: "' + result.cardId + '"');
  console.log('  toCollect: ' + result.toCollect.toFixed(2));
  console.log('  collectedInHand: ' + result.collectedInHand.toFixed(2));
  console.log('  friendUsage: ' + result.friendUsage.toFixed(2));
  console.log('  totalCardUsage: ' + result.totalCardUsage.toFixed(2) + ' ⬅️ NEW FIELD');
  console.log('  friendCycleUsage: ' + result.friendCycleUsage.toFixed(2));
  console.log('  friendBreakdown: [');
  result.friendBreakdown.forEach(fb => {
    console.log('    { holderName: "' + fb.holderName + '", owed: ' + fb.owed.toFixed(2) + ', usage: ' + fb.usage.toFixed(2) + ' }');
  });
  console.log('  ]');
  console.log('  cycles: ' + result.cycles.length + ' cycles');
  console.log('}');

  console.log('\n=== WHAT ANDROID CARDDETAILSCREEN SHOULD DISPLAY ===\n');

  const condition = result.totalCardUsage > result.toCollect + 0.5;
  console.log('Condition: totalCardUsage (' + result.totalCardUsage.toFixed(2) + ') > toCollect (' + result.toCollect.toFixed(2) + ') + 0.5');
  console.log('Result: ' + condition);

  if (condition) {
    const collected = result.collectedInHand > 0.5 ? ' · Collected: +₹' + result.collectedInHand.toFixed(2) : '';
    console.log('\n✅ Usage line WILL BE SHOWN:');
    console.log('   "Usage: ₹' + result.totalCardUsage.toFixed(2) + collected + '"');
  } else {
    console.log('\n❌ Usage line WILL NOT BE SHOWN (condition is false)');
  }

  console.log('\nTo Collect section will show: ₹' + result.toCollect.toFixed(2));

  await pool.end();
}

main().catch(console.error);
