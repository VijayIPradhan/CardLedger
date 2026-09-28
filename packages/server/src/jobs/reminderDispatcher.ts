import { db } from '../db/index.js';
import { reminders, transactions } from '../db/schema.js';
import { eq, and, lte, gte, sql } from 'drizzle-orm';

/**
 * Check if a card has unpaid transactions in a specific billing cycle
 * @param cardId - Card UUID
 * @param cycleStart - Cycle start date (YYYY-MM-DD)
 * @param cycleEnd - Cycle end date (YYYY-MM-DD)
 * @returns true if there are unpaid transactions in the cycle
 */
async function hasUnpaidTransactionsInCycle(
  cardId: string,
  cycleStart: string,
  cycleEnd: string,
): Promise<boolean> {
  const unpaidTxns = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.card_id, cardId),
        eq(transactions.is_paid, false),
        gte(transactions.txn_date, cycleStart),
        lte(transactions.txn_date, cycleEnd),
      ),
    );

  const count = Number(unpaidTxns[0]?.count || 0);
  return count > 0;
}

/**
 * Send push notification via Firebase Cloud Messaging
 * @param userId - User UUID
 * @param reminder - Reminder object
 * TODO: Implement actual FCM integration
 */
async function sendPushNotification(userId: string, reminder: any): Promise<void> {
  // Stub implementation - log for now
  console.log(`[Push] Sending push notification to user ${userId}:`);
  console.log(`  Type: ${reminder.reminder_type}`);
  console.log(`  Card: ${reminder.card_id}`);
  console.log(`  Scheduled for: ${reminder.scheduled_for}`);

  // TODO: Integrate with Firebase Cloud Messaging
  // Example:
  // const message = {
  //   notification: {
  //     title: getReminderTitle(reminder.reminder_type),
  //     body: getReminderBody(reminder),
  //   },
  //   token: await getUserFcmToken(userId),
  // };
  // await admin.messaging().send(message);
}

/**
 * Send email notification
 * @param userId - User UUID
 * @param reminder - Reminder object
 * TODO: Implement actual email integration
 */
async function sendEmailNotification(userId: string, reminder: any): Promise<void> {
  // Stub implementation - log for now
  console.log(`[Email] Sending email notification to user ${userId}:`);
  console.log(`  Type: ${reminder.reminder_type}`);
  console.log(`  Card: ${reminder.card_id}`);
  console.log(`  Scheduled for: ${reminder.scheduled_for}`);

  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  // Example:
  // await emailService.send({
  //   to: await getUserEmail(userId),
  //   subject: getReminderTitle(reminder.reminder_type),
  //   body: getReminderEmailBody(reminder),
  // });
}

/**
 * Runs every 15 minutes to dispatch scheduled reminders
 * Queries reminders due within the next 15 minutes and dispatches them
 */
export async function runReminderDispatcher() {
  const startTime = Date.now();
  console.log('[ReminderDispatcher] Starting reminder dispatch...');

  try {
    // Calculate time window (now to now + 15 minutes)
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes ahead

    // Query reminders that are scheduled and due within the next 15 minutes
    const dueReminders = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, 'scheduled'), lte(reminders.scheduled_for, windowEnd)));

    console.log(`[ReminderDispatcher] Found ${dueReminders.length} reminders to process`);

    let fired = 0;
    let cancelled = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      try {
        // Check if reminder requires usage validation
        if (
          reminder.requires_usage &&
          reminder.card_id &&
          reminder.card_cycle_start &&
          reminder.card_cycle_end
        ) {
          const hasUsage = await hasUnpaidTransactionsInCycle(
            reminder.card_id,
            reminder.card_cycle_start,
            reminder.card_cycle_end,
          );

          if (!hasUsage) {
            // No unpaid transactions in cycle - cancel the reminder
            await db
              .update(reminders)
              .set({
                status: 'cancelled',
                updated_at: new Date(),
              })
              .where(eq(reminders.id, reminder.id));

            console.log(
              `[ReminderDispatcher] Cancelled reminder ${reminder.id}: no unpaid transactions in cycle`,
            );
            cancelled++;
            continue;
          }
        }

        // Determine which notification channels to use
        const notifiedVia: string[] = [];

        // Get notification preference to check push/email settings
        // For now, we'll dispatch based on reminder existence
        // In a full implementation, you'd query notification_preferences here

        // Dispatch push notification (stub)
        try {
          await sendPushNotification(reminder.user_id, reminder);
          notifiedVia.push('push');
        } catch (error) {
          console.error(
            `[ReminderDispatcher] Failed to send push for reminder ${reminder.id}:`,
            error,
          );
        }

        // Dispatch email notification (stub)
        try {
          await sendEmailNotification(reminder.user_id, reminder);
          notifiedVia.push('email');
        } catch (error) {
          console.error(
            `[ReminderDispatcher] Failed to send email for reminder ${reminder.id}:`,
            error,
          );
        }

        // Update reminder status to fired
        await db
          .update(reminders)
          .set({
            status: 'fired',
            fired_at: new Date(),
            notified_via: notifiedVia,
            updated_at: new Date(),
          })
          .where(eq(reminders.id, reminder.id));

        console.log(
          `[ReminderDispatcher] Fired reminder ${reminder.id} via ${notifiedVia.join(', ')}`,
        );
        fired++;
      } catch (error) {
        console.error(`[ReminderDispatcher] Error processing reminder ${reminder.id}:`, error);
        failed++;
        // Continue with next reminder
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[ReminderDispatcher] Completed in ${duration}ms. Fired: ${fired}, Cancelled: ${cancelled}, Failed: ${failed}`,
    );
  } catch (error) {
    console.error('[ReminderDispatcher] Fatal error:', error);
    throw error;
  }
}
