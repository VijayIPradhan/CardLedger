import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './dist/db/schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const { cards, transactions, card_payments, holders } = schema;

async function main() {
  const flipkartCards = await db.select().from(cards).where(eq(cards.nickname, 'FlipkartAxis'));
  const cardId = flipkartCards[0].id;

  const cps = await db.select().from(card_payments).where(eq(card_payments.card_id, cardId));
  const allHolders = await db.select().from(holders);
  const holderMap = Object.fromEntries(allHolders.map(h => [h.id, h.name]));

  console.log('\n=== CARD PAYMENTS FOR FLIPKART AXIS ===\n');

  for (const cp of cps) {
    const holderName = holderMap[cp.holder_id] || 'Unknown';
    let txnInfo = 'No linked transaction';

    if (cp.transaction_id) {
      const txns = await db.select().from(transactions).where(eq(transactions.id, cp.transaction_id)).limit(1);
      if (txns.length > 0) {
        const txn = txns[0];
        txnInfo = `Linked to txn (is_paid=${txn.is_paid})`;
      } else {
        txnInfo = 'Linked to NON-EXISTENT transaction';
      }
    }

    console.log(`₹${parseFloat(cp.amount).toFixed(2).padStart(10)} | ${holderName.padEnd(15)} | ${txnInfo}`);
  }

  await pool.end();
}

main().catch(console.error);
