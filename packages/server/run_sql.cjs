const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://cardledger:Hithika_0985@cardledger-postgres-80-225-193-198.sslip.io:5432/cardledger",
  });
  
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT SUM(t.amount) as total_unpaid_all_friends
      FROM transactions t
      JOIN holders h ON t.holder_id_at_time = h.id
      WHERE h.relationship = 'friend' AND t.type = 'spend' AND t.is_paid = false
    `);
    console.log('Total unpaid all friends:', res.rows[0]);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
