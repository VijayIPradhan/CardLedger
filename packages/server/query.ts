import { db } from './src/db/index.js';
import { transactions } from './src/db/schema.js';
async function run() {
  const all = await db.select().from(transactions);
  console.log(JSON.stringify(all, null, 2));
}
run();
