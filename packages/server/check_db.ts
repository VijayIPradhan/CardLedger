import { db } from './src/db/index.js';
import { transactions } from './src/db/schema.js';

async function main() {
  const txns = await db.select().from(transactions).limit(10);
  console.log('Transactions:');
  for (const t of txns) {
    console.log(`- ID: ${t.id}, DedupeHash: ${t.dedupe_hash}`);
  }
  process.exit(0);
}
main();
