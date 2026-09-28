import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { transactions, cards, card_payments } = schema;

async function main() {
  // Get FlipkartAxis card ID
  const flipkartCard = await db
    .select()
    .from(cards)
    .where(eq(cards.nickname, 'FlipkartAxis'))
    .limit(1);

  if (!flipkartCard.length) {
    console.log('FlipkartAxis card not found');
    process.exit(1);
  }

  const cardId = flipkartCard[0].id;
  console.log(`\n=== FlipkartAxis Card (${cardId}) ===\n`);

  // Get all transactions for this card
  const allTxns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.card_id, cardId))
    .orderBy(transactions.txn_date);

  console.log('=== ALL TRANSACTIONS ===');
  let totalSpend = 0;
  let totalRefunds = 0;
  let settledAmount = 0;
  let unsettledAmount = 0;

  for (const txn of allTxns) {
    const amount = parseFloat(txn.amount);
    const isPaid = txn.is_paid;

    if (amount > 0) {
      totalSpend += amount;
      if (isPaid) {
        settledAmount += amount;
      } else {
        unsettledAmount += amount;
      }
    } else {
      totalRefunds += Math.abs(amount);
    }

    const txnDate = txn.txn_date instanceof Date ? txn.txn_date : new Date(txn.txn_date);
    console.log(
      `${txnDate.toISOString().split('T')[0]} | ` +
      `₹${amount.toFixed(2).padStart(10)} | ` +
      `${isPaid ? 'PAID' : 'UNPAID'} | ` +
      `${txn.merchant?.substring(0, 30) || 'N/A'}`
    );
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total Transactions: ${allTxns.length}`);
  console.log(`Total Spend (excluding refunds): ₹${totalSpend.toFixed(2)}`);
  console.log(`Total Refunds: ₹${totalRefunds.toFixed(2)}`);
  console.log(`Net Usage (spend - refunds): ₹${(totalSpend - totalRefunds).toFixed(2)}`);
  console.log(`Settled (is_paid=true): ₹${settledAmount.toFixed(2)}`);
  console.log(`Unsettled (is_paid=false): ₹${unsettledAmount.toFixed(2)}`);

  // Get card payments for this card
  const cardPayments = await db
    .select()
    .from(card_payments)
    .where(eq(card_payments.card_id, cardId))
    .orderBy(card_payments.payment_date);

  console.log('\n=== CARD PAYMENTS (to bank) ===');
  let totalCardPayments = 0;
  for (const cp of cardPayments) {
    const amount = parseFloat(cp.amount);
    totalCardPayments += amount;
    const payDate = cp.payment_date instanceof Date ? cp.payment_date : new Date(cp.payment_date);
    console.log(
      `${payDate.toISOString().split('T')[0]} | ` +
      `₹${amount.toFixed(2).padStart(10)} | ` +
      `Funded by: ${cp.funded_by_name}`
    );
  }

  console.log(`\nTotal Card Payments: ₹${totalCardPayments.toFixed(2)}`);
  console.log(`\n=== CALCULATED TO COLLECT ===`);
  console.log(`Unsettled - Card Payments = ₹${unsettledAmount.toFixed(2)} - ₹${totalCardPayments.toFixed(2)} = ₹${(unsettledAmount - totalCardPayments).toFixed(2)}`);

  await pool.end();
}

main().catch(console.error);
