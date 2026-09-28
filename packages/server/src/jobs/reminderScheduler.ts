import { db } from '../db/index.js';
import { notification_preferences, cards, reminders } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';

/**
 * Calculate the next occurrence of a specific day of the month
 * @param dayOfMonth - Target day (1-31)
 * @param fromDate - Starting date for calculation
 * @returns Next date when the target day occurs
 */
function getNextDateForDay(dayOfMonth: number, fromDate: Date = new Date()): Date {
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);

  // If current day is before target day in current month, use current month
  if (result.getDate() < dayOfMonth) {
    result.setDate(dayOfMonth);
  } else {
    // Otherwise move to next month
    result.setMonth(result.getMonth() + 1);
    result.setDate(dayOfMonth);
  }

  // Handle months with fewer days (e.g., Feb 31 -> Feb 28/29)
  while (result.getDate() !== dayOfMonth && result.getDate() < dayOfMonth) {
    result.setDate(dayOfMonth);
  }

  return result;
}

/**
 * Calculate billing cycle dates for a card
 * @param billingCycleDay - Statement date day of month
 * @param paymentDueDay - Payment due day of month
 * @returns Cycle start, end, statement date, and due date
 */
function calculateBillingCycle(billingCycleDay: number, paymentDueDay: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Get next statement date
  const nextStatementDate = getNextDateForDay(billingCycleDay);

  // Cycle starts one day after previous statement date
  const cycleStart = new Date(nextStatementDate);
  cycleStart.setMonth(cycleStart.getMonth() - 1);
  cycleStart.setDate(cycleStart.getDate() + 1);

  // Cycle ends on statement date
  const cycleEnd = new Date(nextStatementDate);

  // Payment due date
  const paymentDueDate = getNextDateForDay(paymentDueDay);

  // If payment due is before statement date, it's for next cycle
  if (paymentDueDate <= nextStatementDate) {
    paymentDueDate.setMonth(paymentDueDate.getMonth() + 1);
  }

  return {
    cycleStart,
    cycleEnd,
    statementDate: nextStatementDate,
    paymentDueDate,
  };
}

/**
 * Combine date with time string
 * @param date - Target date
 * @param timeString - Time in HH:mm:ss format
 * @returns Combined timestamp
 */
function combineDateAndTime(date: Date, timeString: string = '09:00:00'): Date {
  const result = new Date(date);
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  result.setHours(hours || 0, minutes || 0, seconds || 0, 0);
  return result;
}

/**
 * Daily job that generates reminders based on notification preferences
 * Creates reminders for payment_due and statement_date events
 */
export async function runReminderScheduler() {
  const startTime = Date.now();
  console.log('[ReminderScheduler] Starting daily reminder generation...');

  try {
    // Fetch all enabled notification preferences with their card details
    const preferences = await db
      .select({
        prefId: notification_preferences.id,
        userId: notification_preferences.user_id,
        cardId: notification_preferences.card_id,
        reminderType: notification_preferences.reminder_type,
        daysBefore: notification_preferences.days_before,
        pushEnabled: notification_preferences.push_enabled,
        emailEnabled: notification_preferences.email_enabled,
        preferredTime: notification_preferences.preferred_time,
        billingCycleDay: cards.billing_cycle_day,
        paymentDueDay: cards.payment_due_day,
      })
      .from(notification_preferences)
      .leftJoin(cards, eq(notification_preferences.card_id, cards.id))
      .where(eq(notification_preferences.enabled, true));

    console.log(`[ReminderScheduler] Found ${preferences.length} enabled preferences`);

    let created = 0;
    let skipped = 0;

    for (const pref of preferences) {
      try {
        // Skip if card details are missing (global preferences not yet supported)
        if (!pref.cardId || !pref.billingCycleDay || !pref.paymentDueDay) {
          console.log(
            `[ReminderScheduler] Skipping preference ${pref.prefId}: missing card details`,
          );
          skipped++;
          continue;
        }

        // Calculate billing cycle dates
        const cycle = calculateBillingCycle(pref.billingCycleDay, pref.paymentDueDay);

        // Determine target date based on reminder type
        let targetDate: Date;
        let reminderDate: Date;

        if (pref.reminderType === 'payment_due') {
          targetDate = cycle.paymentDueDate;
          reminderDate = new Date(targetDate);
          reminderDate.setDate(reminderDate.getDate() - (pref.daysBefore || 0));
        } else if (pref.reminderType === 'statement_date') {
          targetDate = cycle.statementDate;
          reminderDate = new Date(targetDate);
          reminderDate.setDate(reminderDate.getDate() - (pref.daysBefore || 0));
        } else {
          console.log(`[ReminderScheduler] Unknown reminder type: ${pref.reminderType}`);
          skipped++;
          continue;
        }

        // Skip if reminder date is in the past
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (reminderDate < now) {
          console.log(`[ReminderScheduler] Skipping past reminder for card ${pref.cardId}`);
          skipped++;
          continue;
        }

        // Combine with preferred time
        const scheduledFor = combineDateAndTime(reminderDate, pref.preferredTime || '09:00:00');

        // Check if reminder already exists for this cycle
        const existing = await db
          .select()
          .from(reminders)
          .where(
            and(
              eq(reminders.user_id, pref.userId),
              eq(reminders.card_id, pref.cardId),
              eq(reminders.reminder_type, pref.reminderType),
              eq(reminders.card_cycle_start, cycle.cycleStart.toISOString().split('T')[0]),
              eq(reminders.card_cycle_end, cycle.cycleEnd.toISOString().split('T')[0]),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          console.log(
            `[ReminderScheduler] Reminder already exists for user ${pref.userId}, card ${pref.cardId}, type ${pref.reminderType}, cycle ${cycle.cycleStart.toISOString().split('T')[0]}`,
          );
          skipped++;
          continue;
        }

        // Create the reminder
        await db.insert(reminders).values({
          user_id: pref.userId,
          card_id: pref.cardId,
          reminder_type: pref.reminderType,
          scheduled_for: scheduledFor,
          card_cycle_start: cycle.cycleStart.toISOString().split('T')[0],
          card_cycle_end: cycle.cycleEnd.toISOString().split('T')[0],
          requires_usage:
            pref.reminderType === 'payment_due' || pref.reminderType === 'statement_date',
          status: 'scheduled',
        });

        console.log(
          `[ReminderScheduler] Created ${pref.reminderType} reminder for card ${pref.cardId}, scheduled for ${scheduledFor.toISOString()}`,
        );
        created++;
      } catch (error) {
        console.error(`[ReminderScheduler] Error processing preference ${pref.prefId}:`, error);
        // Continue with next preference
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[ReminderScheduler] Completed in ${duration}ms. Created: ${created}, Skipped: ${skipped}`,
    );
  } catch (error) {
    console.error('[ReminderScheduler] Fatal error:', error);
    throw error;
  }
}
