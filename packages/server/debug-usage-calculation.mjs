import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, transactions, holders } = schema;

async function main() {
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  if (!flipkartCards.length) {
    console.log('FlipkartAxis not found');
    process.exit(1);
  }
  const card = flipkartCards[0];

  const allHolders = await db.select().from(holders);
  const holderMap = Object.fromEntries(allHolders.map(h => [h.id, h]));

  const cardTxns = await db.select().from(transactions).where(eq(transactions.card_id, card.id));

  console.log('\n=== ALL TRANSACTIONS FOR FLIPKART AXIS ===\n');
  console.log('Total transactions:', cardTxns.length);

  let totalUnpaid = 0;
  let totalPaid = 0;
  let unpaidByHolder = {};

  console.log('\nUNPAID TRANSACTIONS:');
  cardTxns.filter(t => !t.is_paid).forEach(t => {
    const holder = holderMap[t.holder_id_at_time];
    const amount = parseFloat(t.amount);

    if (t.type === 'spend' || t.type === 'refund') {
      const adjustedAmount = t.type === 'spend' ? amount : -amount;
      totalUnpaid += adjustedAmount;

      if (!unpaidByHolder[holder.name]) {
        unpaidByHolder[holder.name] = { spend: 0, refund: 0, net: 0 };
      }

      if (t.type === 'spend') {
        unpaidByHolder[holder.name].spend += amount;
      } else {
        unpaidByHolder[holder.name].refund += amount;
      }
      unpaidByHolder[holder.name].net += adjustedAmount;

      console.log(`  ${t.txn_date.toISOString().split('T')[0]} | ${holder.name.padEnd(15)} | ${t.type.padEnd(6)} | ₹${amount.toFixed(2).padStart(10)} | ${t.merchant.substring(0, 30)}`);
    }
  });

  console.log('\nPAID TRANSACTIONS:');
  cardTxns.filter(t => t.is_paid).forEach(t => {
    const holder = holderMap[t.holder_id_at_time];
    const amount = parseFloat(t.amount);

    if (t.type === 'spend' || t.type === 'refund') {
      const adjustedAmount = t.type === 'spend' ? amount : -amount;
      totalPaid += adjustedAmount;
      console.log(`  ${t.txn_date.toISOString().split('T')[0]} | ${holder.name.padEnd(15)} | ${t.type.padEnd(6)} | ₹${amount.toFixed(2).padStart(10)} | ${t.merchant.substring(0, 30)}`);
    }
  });

  console.log('\n=== SUMMARY ===\n');
  console.log('Total Unpaid (what should show as Usage): ₹' + totalUnpaid.toFixed(2));
  console.log('Total Paid: ₹' + totalPaid.toFixed(2));
  console.log('Grand Total: ₹' + (totalUnpaid + totalPaid).toFixed(2));

  console.log('\n=== UNPAID BY HOLDER ===\n');
  Object.entries(unpaidByHolder).forEach(([name, amounts]) => {
    console.log(`${name}:`);
    console.log(`  Spend: ₹${amounts.spend.toFixed(2)}`);
    console.log(`  Refund: ₹${amounts.refund.toFixed(2)}`);
    console.log(`  Net Unpaid: ₹${amounts.net.toFixed(2)}`);
    console.log();
  });

  console.log('=== WHAT YOU SEE IN APP ===');
  console.log('You reported seeing: ₹70,681');
  console.log('Server calculates: ₹' + totalUnpaid.toFixed(2));
  console.log('Difference: ₹' + Math.abs(70681 - totalUnpaid).toFixed(2));

  await pool.end();
}

main().catch(console.error);
