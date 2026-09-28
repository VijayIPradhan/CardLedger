import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { transactions, cards, holders, payments, card_payments } = schema;

async function main() {
  // Get FlipkartAxis card
  const flipkartCard = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis')).limit(1);
  if (!flipkartCard.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const cardId = flipkartCard[0].id;

  // Get all holders
  const allHolders = await db.select().from(holders);
  const holderMap = Object.fromEntries(allHolders.map(h => [h.id, h]));

  // Get all transactions for this card
  const allTxns = await db.select().from(transactions).where(eq(transactions.card_id, cardId));

  // Get all payments for transactions on this card
  const txnIds = allTxns.map(t => t.id);
  const allPayments = await db.select().from(payments);
  const paymentsForCard = allPayments.filter(p => p.transaction_id && txnIds.includes(p.transaction_id));

  // Get all card payments for this card
  const allCardPayments = await db.select().from(card_payments).where(eq(card_payments.card_id, cardId));

  console.log('\n=== UNPAID SPEND BY HOLDER ===\n');

  const byHolder = {};

  for (const txn of allTxns) {
    const holderId = txn.holder_id_at_time;
    const holderName = holderMap[holderId]?.name || 'Unknown';
    const relationship = holderMap[holderId]?.relationship || 'unknown';
    const amount = parseFloat(txn.amount);
    const isPaid = txn.is_paid;

    if (!byHolder[holderId]) {
      byHolder[holderId] = {
        name: holderName,
        relationship,
        totalSpend: 0,
        paidSpend: 0,
        unpaidSpend: 0,
        cashReceived: 0,
        cardPaymentsMade: 0,
      };
    }

    if (amount > 0) {
      byHolder[holderId].totalSpend += amount;
      if (isPaid) {
        byHolder[holderId].paidSpend += amount;
      } else {
        byHolder[holderId].unpaidSpend += amount;
      }
    }
  }

  // Add cash payments
  for (const pmt of paymentsForCard) {
    const holderId = pmt.holder_id;
    if (byHolder[holderId]) {
      byHolder[holderId].cashReceived += parseFloat(pmt.amount);
    }
  }

  // Add card payments
  for (const cp of allCardPayments) {
    const holderId = cp.holder_id;
    if (byHolder[holderId]) {
      byHolder[holderId].cardPaymentsMade += parseFloat(cp.amount);
    }
  }

  // Print breakdown
  for (const [holderId, data] of Object.entries(byHolder)) {
    const toCollect = data.unpaidSpend - data.cashReceived - data.cardPaymentsMade;

    console.log(`${data.name} (${data.relationship}):`);
    console.log(`  Unpaid Spend (usage):     ₹${data.unpaidSpend.toFixed(2)}`);
    console.log(`  Cash Received:            ₹${data.cashReceived.toFixed(2)}`);
    console.log(`  Card Payments Made:       ₹${data.cardPaymentsMade.toFixed(2)}`);
    console.log(`  To Collect:               ₹${toCollect.toFixed(2)}`);
    console.log();
  }

  // Calculate totals
  const friends = Object.values(byHolder).filter(d => d.relationship !== 'me');
  const totalFriendUsage = friends.reduce((sum, d) => sum + d.unpaidSpend, 0);
  const totalFriendCash = friends.reduce((sum, d) => sum + d.cashReceived, 0);
  const totalFriendCardPayments = friends.reduce((sum, d) => sum + d.cardPaymentsMade, 0);
  const totalToCollect = totalFriendUsage - totalFriendCash - totalFriendCardPayments;

  console.log('=== CARD TOTALS (Friends only) ===');
  console.log(`Total Friend Usage (unpaid):  ₹${totalFriendUsage.toFixed(2)}`);
  console.log(`Total Cash Received:          ₹${totalFriendCash.toFixed(2)}`);
  console.log(`Total Card Payments:          ₹${totalFriendCardPayments.toFixed(2)}`);
  console.log(`Total To Collect:             ₹${totalToCollect.toFixed(2)}`);

  await pool.end();
}

main().catch(console.error);
