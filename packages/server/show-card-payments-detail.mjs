import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, transactions, card_payments, holders } = schema;

function formatDate(date) {
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  return String(date).split('T')[0];
}

async function main() {
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  if (!flipkartCards.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const card = flipkartCards[0];

  const allHolders = await db.select().from(holders);
  const holderMap = Object.fromEntries(allHolders.map(h => [h.id, h]));

  const cardCardPayments = await db
    .select()
    .from(card_payments)
    .where(eq(card_payments.card_id, card.id))
    .orderBy(card_payments.payment_date);

  const allTxns = await db.select().from(transactions);
  const txnById = new Map(allTxns.map(t => [t.id, t]));

  console.log('\n=== ALL CARD PAYMENTS FOR FLIPKART AXIS ===\n');
  console.log('Total card payments:', cardCardPayments.length);
  console.log();

  let totalAllPayments = 0;
  let totalCountedPayments = 0;
  let countedPayments = [];
  let skippedPayments = [];

  cardCardPayments.forEach(cp => {
    const holder = holderMap[cp.holder_id];
    const amount = parseFloat(cp.amount);
    totalAllPayments += amount;

    let counted = false;
    let reason = '';

    if (cp.transaction_id) {
      const txn = txnById.get(cp.transaction_id);
      if (txn && !txn.is_paid) {
        // Linked to UNPAID transaction - COUNTED
        counted = true;
        reason = `Linked to UNPAID txn: ${txn.merchant} (${formatDate(txn.txn_date)})`;
      } else if (txn && txn.is_paid) {
        // Linked to PAID transaction - SKIPPED
        reason = `Linked to PAID txn: ${txn.merchant} (${formatDate(txn.txn_date)})`;
      } else {
        reason = 'Linked to NON-EXISTENT transaction';
      }
    } else {
      // Unlinked payment - COUNTED
      counted = true;
      reason = 'Unlinked payment (no transaction_id)';
    }

    const entry = {
      date: formatDate(cp.payment_date),
      holder: holder.name,
      amount: amount,
      reason: reason,
      notes: cp.notes || 'N/A'
    };

    if (counted) {
      totalCountedPayments += amount;
      countedPayments.push(entry);
    } else {
      skippedPayments.push(entry);
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ COUNTED PAYMENTS (subtracted from card ring balance)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  if (countedPayments.length === 0) {
    console.log('  No counted payments found.');
  } else {
    countedPayments.forEach(p => {
      console.log(`  ${p.date} │ ${p.holder.padEnd(15)} │ ₹${p.amount.toFixed(2).padStart(10)} │ ${p.notes}`);
      console.log(`           └─ ${p.reason}`);
      console.log();
    });
    console.log('  ────────────────────────────────────────────────────────────────────────');
    console.log(`  Total Counted: ₹${totalCountedPayments.toFixed(2)}`);
    console.log('  (This amount is subtracted from unpaid spend in card ring)');
  }

  console.log();
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ❌ SKIPPED PAYMENTS (NOT subtracted, already accounted for)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  if (skippedPayments.length === 0) {
    console.log('  No skipped payments.');
  } else {
    skippedPayments.forEach(p => {
      console.log(`  ${p.date} │ ${p.holder.padEnd(15)} │ ₹${p.amount.toFixed(2).padStart(10)} │ ${p.notes}`);
      console.log(`           └─ ${p.reason}`);
      console.log();
    });
    console.log('  ────────────────────────────────────────────────────────────────────────');
    console.log(`  Total Skipped: ₹${(totalAllPayments - totalCountedPayments).toFixed(2)}`);
    console.log('  (Already accounted for by marking transactions as is_paid=true)');
  }

  console.log();
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CALCULATION BREAKDOWN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('  Unpaid Spend:              ₹58,736.00');
  console.log('  Minus Counted Payments:    ₹' + totalCountedPayments.toFixed(2));
  console.log('  ──────────────────────────────────────');
  console.log('  Card Ring Balance:         ₹' + (58736 - totalCountedPayments).toFixed(2));
  console.log();

  await pool.end();
}

main().catch(console.error);
