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
  // Get FlipkartAxis card
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  if (!flipkartCards.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const card = flipkartCards[0];

  // Get all data needed for computation
  const [allHolders, allTxns, allPayments, allCardPayments, allAssignments] = await Promise.all([
    db.select().from(holders),
    db.select().from(transactions),
    db.select().from(payments),
    db.select().from(card_payments),
    db.select().from(assignments),
  ]);

  // Convert to the format expected by computeCardDetail
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

  console.log('\n=== COMPUTED CARD DETAIL FOR FLIPKART AXIS ===\n');
  console.log(`Card To Collect: ₹${result.toCollect.toFixed(2)}`);
  console.log(`Collected In Hand: ₹${result.collectedInHand.toFixed(2)}`);
  console.log(`Friend Usage: ₹${result.friendUsage.toFixed(2)}`);
  console.log(`Total Card Usage (NEW): ₹${result.totalCardUsage.toFixed(2)}`);
  console.log(`Friend Cycle Usage: ₹${result.friendCycleUsage.toFixed(2)}`);

  console.log('\n=== FRIEND BREAKDOWN ===\n');
  for (const fb of result.friendBreakdown) {
    console.log(`${fb.holderName}:`);
    console.log(`  Usage (unpaid):       ₹${fb.usage.toFixed(2)}`);
    console.log(`  Collected In Hand:    ₹${fb.collectedInHand.toFixed(2)}`);
    console.log(`  To Collect (owed):    ₹${fb.owed.toFixed(2)}`);
    console.log();
  }

  await pool.end();
}

main().catch(console.error);
