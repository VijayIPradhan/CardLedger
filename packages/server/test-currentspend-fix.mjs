import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, transactions, card_payments } = schema;

function round(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  if (!flipkartCards.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const card = flipkartCards[0];

  const allTxns = await db.select().from(transactions);
  const allCardPayments = await db.select().from(card_payments);

  const groupCardIds = new Set([card.id]); // No shared limit for simplicity

  // Calculate unpaid spend (matching the server logic)
  const spend = (cardIds, unpaidOnly) =>
    round(
      allTxns.reduce((sum, t) => {
        if (!cardIds.has(t.card_id)) return sum;
        if (unpaidOnly && t.is_paid) return sum;
        const amt = Number(t.amount) || 0;
        if (t.type === 'spend') return sum + amt;
        if (t.type === 'refund' || t.type === 'bill_payment') return sum - amt;
        return sum;
      }, 0),
    );

  const unpaidSpend = spend(groupCardIds, true);

  // OLD calculation (buggy - subtracts ALL card payments)
  const oldGroupCardPayments = round(
    allCardPayments.reduce(
      (sum, p) => (groupCardIds.has(p.card_id) ? sum + (Number(p.amount) || 0) : sum),
      0,
    ),
  );

  // NEW calculation (fixed - only subtracts payments against unpaid transactions)
  const txnById = new Map(allTxns.map((t) => [t.id, t]));
  const newGroupCardPayments = round(
    allCardPayments.reduce((sum, p) => {
      if (!groupCardIds.has(p.card_id)) return sum;
      // Only count payments that are unlinked OR linked to unpaid transactions
      if (p.transaction_id) {
        const txn = txnById.get(p.transaction_id);
        if (!txn || txn.is_paid) return sum; // Skip if linked to paid transaction
      }
      return sum + (Number(p.amount) || 0);
    }, 0),
  );

  console.log('\n=== CURRENTSPEND CALCULATION FIX ===\n');
  console.log('Unpaid Spend: ₹' + unpaidSpend.toFixed(2));

  console.log('\n--- OLD (BUGGY) ---');
  console.log('Total Card Payments (all): ₹' + oldGroupCardPayments.toFixed(2));
  console.log('currentSpend = ' + unpaidSpend.toFixed(2) + ' - ' + oldGroupCardPayments.toFixed(2) + ' = ₹' + (unpaidSpend - oldGroupCardPayments).toFixed(2));
  console.log('❌ Shows as NEGATIVE in card ring!');

  console.log('\n--- NEW (FIXED) ---');
  console.log('Card Payments (unpaid only): ₹' + newGroupCardPayments.toFixed(2));
  console.log('currentSpend = ' + unpaidSpend.toFixed(2) + ' - ' + newGroupCardPayments.toFixed(2) + ' = ₹' + (unpaidSpend - newGroupCardPayments).toFixed(2));
  console.log('✅ Shows as POSITIVE!');

  console.log('\n=== CARD RING WILL SHOW ===');
  const finalCurrentSpend = unpaidSpend - newGroupCardPayments;
  console.log('Card ring spend: ₹' + finalCurrentSpend.toFixed(2));
  console.log('Credit limit: ₹' + parseFloat(card.credit_limit).toFixed(2));
  const utilization = (finalCurrentSpend / parseFloat(card.credit_limit) * 100).toFixed(1);
  console.log('Utilization: ' + utilization + '%');

  await pool.end();
}

main().catch(console.error);
