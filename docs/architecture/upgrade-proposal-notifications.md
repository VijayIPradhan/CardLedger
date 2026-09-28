# Phase 1: Persistent Notification System

## Schema Changes

### New Table: `reminders`
```sql
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  reminder_type VARCHAR(30) NOT NULL, -- 'payment_due', 'statement_date', 'overdue', 'cycle_usage_threshold'
  scheduled_for TIMESTAMP NOT NULL,
  card_cycle_start DATE, -- Which billing cycle this reminder is for (nullable)
  card_cycle_end DATE,
  
  -- Alert conditions
  threshold_amount NUMERIC(12,2), -- For usage threshold alerts
  requires_usage BOOLEAN DEFAULT false, -- Only fire if cycle has unpaid transactions
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'fired', 'dismissed', 'cancelled'
  fired_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  notified_via JSONB, -- ['push', 'email'] - which channels were used
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_reminders_user_scheduled (user_id, scheduled_for) WHERE status = 'scheduled',
  INDEX idx_reminders_card_cycle (card_id, card_cycle_start, card_cycle_end)
);
```

### New Table: `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE, -- NULL = default for all cards
  
  reminder_type VARCHAR(30) NOT NULL, -- 'payment_due', 'statement_date', 'overdue'
  
  days_before INTEGER, -- For due/statement reminders
  enabled BOOLEAN DEFAULT true,
  
  -- Channels (at least one must be true if enabled)
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  
  -- Smart scheduling
  preferred_time TIME DEFAULT '09:00:00',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, card_id, reminder_type),
  CHECK (NOT enabled OR (push_enabled OR email_enabled))
);
```

## Server Changes

### New API Endpoints

**GET /reminders**
- List upcoming reminders (next 30 days)
- Filter by card, type, status
```typescript
interface ReminderDto {
  id: string;
  cardNickname: string;
  reminderType: string;
  scheduledFor: string;
  cycleStart?: string;
  cycleEnd?: string;
  requiresUsage: boolean;
  status: string;
}
```

**POST /reminders/:id/dismiss**
- Dismiss/snooze a reminder
```typescript
{
  snoozeUntil?: string; // ISO date, reschedule instead of dismiss
}
```

**GET /notification-preferences**
**PATCH /notification-preferences**
- Manage per-card or global reminder settings

### New Background Job: Reminder Scheduler

**Location**: `packages/server/src/jobs/reminderScheduler.ts`

```typescript
/**
 * Runs daily to create reminders for upcoming billing dates and due dates.
 * 
 * For each card:
 * 1. Calculate next statement date (billing_cycle_day)
 * 2. Calculate next payment due date (payment_due_day)
 * 3. Check user's notification_preferences
 * 4. Create reminders if they don't exist yet
 */
async function scheduleUpcomingReminders() {
  const cards = await db.select().from(cards);
  
  for (const card of cards) {
    const prefs = await getUserNotificationPrefs(card.user_id, card.id);
    
    // Statement reminder
    if (prefs.statementDate.enabled) {
      const nextStatement = getNextStatementDate(card.billing_cycle_day);
      const reminderDate = subDays(nextStatement, prefs.statementDate.daysBefore);
      
      await createReminderIfNotExists({
        userId: card.user_id,
        cardId: card.id,
        reminderType: 'statement_date',
        scheduledFor: setHours(reminderDate, prefs.statementDate.preferredHour),
        requiresUsage: false, // Always remind about statement
      });
    }
    
    // Payment due reminder
    if (prefs.paymentDue.enabled) {
      const nextDue = getNextDueDate(card.billing_cycle_day, card.payment_due_day);
      const reminderDate = subDays(nextDue, prefs.paymentDue.daysBefore);
      
      await createReminderIfNotExists({
        userId: card.user_id,
        cardId: card.id,
        reminderType: 'payment_due',
        scheduledFor: setHours(reminderDate, prefs.paymentDue.preferredHour),
        requiresUsage: true, // Only remind if there's unpaid usage
        cardCycleStart: getCycleStart(card.billing_cycle_day, nextDue),
        cardCycleEnd: getCycleEnd(card.billing_cycle_day, nextDue),
      });
    }
  }
}
```

### New Background Job: Reminder Dispatcher

**Location**: `packages/server/src/jobs/reminderDispatcher.ts`

```typescript
/**
 * Runs every 15 minutes to dispatch due reminders.
 */
async function dispatchDueReminders() {
  const dueReminders = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.status, 'scheduled'),
        lte(reminders.scheduled_for, new Date())
      )
    );
  
  for (const reminder of dueReminders) {
    // Check conditions
    if (reminder.requires_usage) {
      const hasUsage = await checkCycleHasUnpaidUsage(
        reminder.card_id,
        reminder.card_cycle_start,
        reminder.card_cycle_end
      );
      
      if (!hasUsage) {
        await db.update(reminders)
          .set({ status: 'cancelled' })
          .where(eq(reminders.id, reminder.id));
        continue;
      }
    }
    
    // Dispatch to channels
    const prefs = await getNotificationPrefs(reminder.user_id, reminder.card_id, reminder.reminder_type);
    const channels = [];
    
    if (prefs.push_enabled) {
      await sendPushNotification(reminder);
      channels.push('push');
    }
    
    if (prefs.email_enabled) {
      await sendEmailNotification(reminder);
      channels.push('email');
    }
    
    await db.update(reminders)
      .set({
        status: 'fired',
        fired_at: new Date(),
        notified_via: channels,
      })
      .where(eq(reminders.id, reminder.id));
  }
}
```

## Android App Changes

### Remove AlarmManager Scheduling
**Delete/Deprecate**: `packages/android-native/app/src/main/java/com/imvj/cardledger/notif/ReminderScheduler.kt`

### Add Push Notification Handler
**New**: `packages/android-native/app/src/main/java/com/imvj/cardledger/notif/PushNotificationReceiver.kt`
- Integrate Firebase Cloud Messaging (FCM)
- Register device token with server
- Display notifications from server

### Update PrefsStore
- Fetch `notification_preferences` from server on settings screen
- Sync changes via API instead of local-only storage

## Migration Strategy

### Drizzle Migration: `0018_add_notification_system.sql`
```sql
-- Create new tables
CREATE TABLE reminders (...);
CREATE TABLE notification_preferences (...);

-- Migrate existing Android preferences to server
-- (Requires one-time data sync from clients)
```

### Android Migration
```kotlin
// On app update, push local preferences to server
suspend fun migrateRemindersToServer() {
  val localPrefs = prefsStore.getReminderSettings()
  
  api.createNotificationPreferences(
    cardId = null, // Global default
    reminderType = "payment_due",
    daysBefore = localPrefs.daysBeforeDue,
    enabled = localPrefs.dueRemindersEnabled
  )
  
  api.createNotificationPreferences(
    cardId = null,
    reminderType = "statement_date",
    daysBefore = localPrefs.daysBeforeStatement,
    enabled = localPrefs.statementRemindersEnabled
  )
  
  // Mark migrated
  prefsStore.setRemindersMigrated(true)
}
```

## Benefits

✅ **Cross-Platform**: Web, Android, iOS can all receive reminders
✅ **Persistent**: Survives app uninstall/reinstall
✅ **Auditable**: Track which reminders fired, when, how user responded
✅ **Conditional**: "Only remind if there's usage" built into system
✅ **Configurable**: Per-card or global settings, multiple channels
✅ **Snooze Support**: Dismiss or reschedule reminders
✅ **Email Fallback**: Critical for overdue payments when push isn't available

## Estimated Effort

- **Schema + Migrations**: 4 hours
- **Server API endpoints**: 8 hours
- **Background jobs (scheduler + dispatcher)**: 12 hours
- **Android FCM integration**: 6 hours
- **Android preference migration**: 4 hours
- **Testing**: 8 hours

**Total**: ~5 days (1 sprint)
