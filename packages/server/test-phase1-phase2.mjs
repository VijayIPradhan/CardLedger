import 'dotenv/config';

const API_URL = process.env.API_URL || 'http://localhost:3002';
const TEST_USERNAME = 'testuser';
const TEST_PASSWORD = 'test12345';

let token = null;
let userId = null;
let cardId = null;

async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

async function login() {
  console.log('\n🔐 Logging in...');
  const res = await api('POST', '/auth/login', { username: TEST_USERNAME, password: TEST_PASSWORD });
  token = res.token;
  console.log('✅ Logged in');
}

async function testNotificationPreferences() {
  console.log('\n📬 Testing Notification Preferences...');

  // Get preferences (should be empty initially)
  let prefs = await api('GET', '/notification-preferences');
  console.log(`  Initial preferences: ${prefs.length} found`);

  // Create a preference
  const newPref = await api('POST', '/notification-preferences', {
    reminder_type: 'payment_due',
    days_before: 3,
    enabled: true,
    push_enabled: true,
    email_enabled: false,
    preferred_time: '09:00:00'
  });
  console.log(`  ✅ Created preference: ${newPref.reminder_type}`);

  // Get preferences again
  prefs = await api('GET', '/notification-preferences');
  console.log(`  After create: ${prefs.length} preferences`);

  // Update preference (upsert)
  const updated = await api('POST', '/notification-preferences', {
    reminder_type: 'payment_due',
    days_before: 5,
    enabled: true,
    push_enabled: true,
    email_enabled: true,
    preferred_time: '10:00:00'
  });
  console.log(`  ✅ Updated preference: days_before=${updated.days_before}`);
}

async function testReminders() {
  console.log('\n⏰ Testing Reminders...');

  // Get user's cards
  const cards = await api('GET', '/cards');
  if (cards.length === 0) {
    console.log('  ⚠️  No cards found, skipping card-specific reminder test');
    return;
  }
  cardId = cards[0].id;

  // Create a reminder
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const newReminder = await api('POST', '/reminders', {
    card_id: cardId,
    reminder_type: 'payment_due',
    scheduled_for: tomorrow,
    requires_usage: true
  });
  console.log(`  ✅ Created reminder: ${newReminder.id} scheduled for ${newReminder.scheduled_for}`);

  // List reminders
  let reminders = await api('GET', '/reminders');
  console.log(`  Total reminders: ${reminders.length}`);

  // List only scheduled
  reminders = await api('GET', '/reminders?status=scheduled');
  console.log(`  Scheduled reminders: ${reminders.length}`);

  // Dismiss reminder
  const dismissed = await api('PATCH', `/reminders/${newReminder.id}/dismiss`, {});
  console.log(`  ✅ Dismissed reminder: status=${dismissed.status}`);

  // Create another reminder to test delete
  const reminder2 = await api('POST', '/reminders', {
    reminder_type: 'statement_date',
    scheduled_for: tomorrow
  });

  // Delete reminder
  await api('DELETE', `/reminders/${reminder2.id}`);
  console.log(`  ✅ Cancelled reminder: ${reminder2.id}`);
}

async function testBillingCycles() {
  console.log('\n📅 Testing Billing Cycles...');

  if (!cardId) {
    const cards = await api('GET', '/cards');
    if (cards.length === 0) {
      console.log('  ⚠️  No cards found, skipping billing cycle tests');
      return;
    }
    cardId = cards[0].id;
  }

  // Create a billing cycle
  const cycleStart = '2026-09-05';
  const cycleEnd = '2026-10-04';
  const newCycle = await api('POST', '/billing-cycles', {
    card_id: cardId,
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
    statement_date: '2026-10-05',
    payment_due_date: '2026-10-25',
    statement_amount: 50000,
    minimum_due: 2500,
    notes: 'Test cycle from API test'
  });
  console.log(`  ✅ Created cycle: ${newCycle.id} (${cycleStart} to ${cycleEnd})`);
  console.log(`      Status: ${newCycle.status}, Locked: ${newCycle.is_locked}`);
  console.log(`      Statement: ₹${newCycle.statement_amount}, Paid: ₹${newCycle.paid_amount}`);

  // List cycles
  let cycles = await api('GET', '/billing-cycles');
  console.log(`  Total cycles: ${cycles.length}`);

  // List cycles for specific card
  cycles = await api('GET', `/billing-cycles?card_id=${cardId}`);
  console.log(`  Cycles for card: ${cycles.length}`);

  // Get cycle detail
  const detail = await api('GET', `/billing-cycles/${newCycle.id}`);
  console.log(`  ✅ Cycle detail: ${detail.transactions.length} transactions, ${detail.card_payments.length} card payments`);

  // Update cycle
  const updated = await api('PATCH', `/billing-cycles/${newCycle.id}`, {
    notes: 'Updated via API test',
    paid_amount: 25000
  });
  console.log(`  ✅ Updated cycle: paid_amount=₹${updated.paid_amount}`);

  // Close cycle
  const closed = await api('POST', `/billing-cycles/${newCycle.id}/close`, {});
  console.log(`  ✅ Closed cycle: locked=${closed.is_locked}, status=${closed.status}`);

  // Try to update locked cycle (should fail)
  try {
    await api('PATCH', `/billing-cycles/${newCycle.id}`, { notes: 'Should fail' });
    console.log('  ❌ ERROR: Should not allow updating locked cycle');
  } catch (err) {
    if (err.message.includes('403')) {
      console.log('  ✅ Correctly blocked update to locked cycle (403)');
    } else {
      console.log(`  ⚠️  Unexpected error: ${err.message}`);
    }
  }
}

async function main() {
  try {
    console.log('🧪 Testing Phase 1 & Phase 2 API Endpoints');
    console.log('='.repeat(50));

    await login();
    await testNotificationPreferences();
    await testReminders();
    await testBillingCycles();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main();
