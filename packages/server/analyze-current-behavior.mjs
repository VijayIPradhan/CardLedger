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

  const [allHolders, allTxns, allPayments, allCardPayments, allAssignments] = await Promise.all([
    db.select().from(holders),
    db.select().from(transactions),
    db.select().from(payments),
    db.select().from(card_payments),
    db.select().from(assignments),
  ]);

  const cardTxns = allTxns.filter(t => t.card_id === card.id);
  const holderMap = Object.fromEntries(allHolders.map(h => [h.id, h]));

  console.log('\n=== FLIPKART AXIS: RAW TRANSACTION DATA ===\n');

  let totalUnpaid = 0;
  let friendUnpaid = 0;
  let meUnpaid = 0;

  for (const txn of cardTxns) {
    const holder = holderMap[txn.holder_id_at_time];
    const amount = parseFloat(txn.amount);

    if (!txn.is_paid && amount > 0) {
      totalUnpaid += amount;
      if (holder.relationship === 'friend') {
        friendUnpaid += amount;
      } else if (holder.relationship === 'me') {
        meUnpaid += amount;
      }
    }
  }

  console.log(`Total Unpaid Spend on Card: ₹${totalUnpaid.toFixed(2)}`);
  console.log(`  - Friend Unpaid: ₹${friendUnpaid.toFixed(2)}`);
  console.log(`  - Me Unpaid: ₹${meUnpaid.toFixed(2)}`);

  // Card payments
  const cardCardPayments = allCardPayments.filter(cp => cp.card_id === card.id);
  let totalCardPayments = 0;
  let friendCardPayments = 0;
  let meCardPayments = 0;

  for (const cp of cardCardPayments) {
    const holder = holderMap[cp.holder_id];
    const amount = parseFloat(cp.amount);
    totalCardPayments += amount;

    if (holder.relationship === 'friend') {
      friendCardPayments += amount;
    } else if (holder.relationship === 'me') {
      meCardPayments += amount;
    }
  }

  console.log(`\nTotal Card Payments: ₹${totalCardPayments.toFixed(2)}`);
  console.log(`  - Friend Card Payments: ₹${friendCardPayments.toFixed(2)}`);
  console.log(`  - Me Card Payments: ₹${meCardPayments.toFixed(2)}`);

  // Compute via API
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

  console.log('\n=== CURRENT API RESPONSE ===\n');
  console.log(`friendUsage: ₹${result.friendUsage.toFixed(2)}`);
  console.log(`toCollect: ₹${result.toCollect.toFixed(2)}`);
  console.log(`collectedInHand: ₹${result.collectedInHand.toFixed(2)}`);

  console.log('\n=== WHAT USER EXPECTS ===\n');
  console.log(`Usage (all unpaid on card, incl Me): ₹${totalUnpaid.toFixed(2)}`);
  console.log(`To Collect (friend unpaid only): ₹${friendUnpaid.toFixed(2)}`);
  console.log(`  (note: card payments should NOT reduce this)`);

  console.log('\n=== USER REPORTED VALUES ===\n');
  console.log(`Usage shown in app: ₹53,736`);
  console.log(`To Collect shown in app: ₹58,117`);

  await pool.end();
}

main().catch(console.error);
