import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, gte, and } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, transactions, holders } = schema;

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

  // Calculate date 2 months ago
  const today = new Date();
  const twoMonthsAgo = new Date(today);
  twoMonthsAgo.setMonth(today.getMonth() - 2);
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0];

  console.log('\n=== FLIPKART AXIS TRANSACTIONS (Last 2 Months) ===');
  console.log('From:', twoMonthsAgoStr, 'to', today.toISOString().split('T')[0]);
  console.log();

  const recentTxns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.card_id, card.id),
        gte(transactions.txn_date, twoMonthsAgoStr)
      )
    )
    .orderBy(transactions.txn_date);

  console.log('Total transactions:', recentTxns.length);
  console.log();

  // Group by month
  const byMonth = {};
  recentTxns.forEach(t => {
    const dateStr = t.txn_date instanceof Date ? t.txn_date.toISOString() : String(t.txn_date);
    const month = dateStr.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) {
      byMonth[month] = { paid: [], unpaid: [] };
    }
    if (t.is_paid) {
      byMonth[month].paid.push(t);
    } else {
      byMonth[month].unpaid.push(t);
    }
  });

  const months = Object.keys(byMonth).sort();

  months.forEach(month => {
    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  ${monthName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const unpaid = byMonth[month].unpaid;
    const paid = byMonth[month].paid;

    if (unpaid.length > 0) {
      console.log('\n  📌 UNPAID (contributes to ₹53,736):');
      console.log();
      let unpaidTotal = 0;
      unpaid.forEach(t => {
        const holder = holderMap[t.holder_id_at_time];
        const amount = parseFloat(t.amount);
        const sign = t.type === 'spend' ? '+' : '-';
        const adjustedAmount = t.type === 'spend' ? amount : -amount;
        unpaidTotal += adjustedAmount;

        console.log(`  ${formatDate(t.txn_date)} │ ${holder.name.padEnd(15)} │ ${t.type.padEnd(12)} │ ${sign}₹${Math.abs(amount).toFixed(2).padStart(10)} │ ${t.merchant}`);
      });
      console.log('  ' + '─'.repeat(80));
      console.log(`  Month Unpaid Total: ₹${unpaidTotal.toFixed(2)}`);
    }

    if (paid.length > 0) {
      console.log('\n  ✅ PAID (already settled):');
      console.log();
      let paidTotal = 0;
      paid.forEach(t => {
        const holder = holderMap[t.holder_id_at_time];
        const amount = parseFloat(t.amount);
        const sign = t.type === 'spend' ? '+' : '-';
        const adjustedAmount = t.type === 'spend' ? amount : -amount;
        paidTotal += adjustedAmount;

        console.log(`  ${formatDate(t.txn_date)} │ ${holder.name.padEnd(15)} │ ${t.type.padEnd(12)} │ ${sign}₹${Math.abs(amount).toFixed(2).padStart(10)} │ ${t.merchant}`);
      });
      console.log('  ' + '─'.repeat(80));
      console.log(`  Month Paid Total: ₹${paidTotal.toFixed(2)}`);
    }
  });

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let totalUnpaid = 0;
  let totalPaid = 0;

  months.forEach(month => {
    byMonth[month].unpaid.forEach(t => {
      const amount = parseFloat(t.amount);
      totalUnpaid += t.type === 'spend' ? amount : -amount;
    });
    byMonth[month].paid.forEach(t => {
      const amount = parseFloat(t.amount);
      totalPaid += t.type === 'spend' ? amount : -amount;
    });
  });

  console.log();
  console.log('  Total Unpaid (last 2 months):  ₹' + totalUnpaid.toFixed(2));
  console.log('  Total Paid (last 2 months):    ₹' + totalPaid.toFixed(2));
  console.log('  Grand Total (last 2 months):   ₹' + (totalUnpaid + totalPaid).toFixed(2));
  console.log();

  // Now show ALL unpaid transactions (not just last 2 months)
  const allUnpaid = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.card_id, card.id),
        eq(transactions.is_paid, false)
      )
    )
    .orderBy(transactions.txn_date);

  let allUnpaidTotal = 0;
  allUnpaid.forEach(t => {
    const amount = parseFloat(t.amount);
    if (t.type === 'spend') allUnpaidTotal += amount;
    else if (t.type === 'refund') allUnpaidTotal -= amount;
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ALL TIME UNPAID');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('  Total unpaid transactions: ' + allUnpaid.length);
  console.log('  Total unpaid amount: ₹' + allUnpaidTotal.toFixed(2));
  console.log('  (This is what shows in card ring after card payment deduction)');
  console.log();

  await pool.end();
}

main().catch(console.error);
