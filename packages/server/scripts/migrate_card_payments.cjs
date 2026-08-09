const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://cardledger:Hithika_0985@cardledger-postgres-80-225-193-198.sslip.io:5432/cardledger",
  });
  
  try {
    await client.connect();
    
    // Begin transaction
    await client.query('BEGIN');
    
    // First, push db schema via drizzle-kit if possible, or just create the table manually
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        card_id uuid NOT NULL REFERENCES cards(id),
        holder_id uuid NOT NULL REFERENCES holders(id),
        amount numeric(12, 2) NOT NULL,
        payment_date date NOT NULL,
        notes varchar(200),
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS card_payments_card_id_idx ON card_payments (card_id);
      CREATE INDEX IF NOT EXISTS card_payments_holder_id_idx ON card_payments (holder_id);
    `);

    console.log("Table created.");

    // Migrate bill payments from transactions
    const res = await client.query(`
      INSERT INTO card_payments (id, card_id, holder_id, amount, payment_date, created_at)
      SELECT id, card_id, holder_id_at_time, amount, txn_date, created_at
      FROM transactions
      WHERE type = 'bill_payment'
      ON CONFLICT DO NOTHING;
    `);
    
    console.log(`Migrated ${res.rowCount} bill payments.`);
    
    // Delete them from transactions
    const resDel = await client.query(`
      DELETE FROM transactions
      WHERE type = 'bill_payment';
    `);
    
    console.log(`Deleted ${resDel.rowCount} bill payments from transactions.`);
    
    await client.query('COMMIT');
    console.log("Migration complete.");
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during migration:', err);
  } finally {
    await client.end();
  }
}

run();
