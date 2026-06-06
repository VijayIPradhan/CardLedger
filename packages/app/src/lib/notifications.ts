import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getDaysUntilDue } from '@cardledger/shared';

const ENABLED_KEY = 'cl_reminders_enabled';
const DAYS_KEY = 'cl_reminder_days';

export function isReminderEnabled(): boolean {
  const v = localStorage.getItem(ENABLED_KEY);
  return v === null ? true : v === 'true';
}

export function setReminderEnabled(v: boolean): void {
  localStorage.setItem(ENABLED_KEY, String(v));
}

export function getReminderDaysBefore(): number {
  const v = localStorage.getItem(DAYS_KEY);
  return v === null ? 3 : Number(v);
}

export function setReminderDaysBefore(n: number): void {
  localStorage.setItem(DAYS_KEY, String(n));
}

// Stable positive 32-bit int from a card UUID — same card → same notification id
function notifId(cardId: string): number {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) {
    h = (h * 31 + cardId.charCodeAt(i)) % 2147483647;
  }
  return h || 1;
}

interface ReminderCard {
  id: string;
  nickname: string;
  payment_due_day: number;
}

export async function scheduleDueReminders(cards: ReminderCard[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isReminderEnabled()) return;

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return;

  // Cancel everything we previously scheduled
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }

  const daysBefore = getReminderDaysBefore();
  const today = new Date().toISOString().split('T')[0];

  const notifications = cards
    .map((card) => {
      const daysUntil = getDaysUntilDue(card.payment_due_day, today);
      const fireInDays = daysUntil - daysBefore;
      if (fireInDays < 0) return null; // due sooner than the reminder window
      const at = new Date();
      at.setDate(at.getDate() + fireInDays);
      at.setHours(9, 0, 0, 0);
      // Skip if the 9 AM slot has already passed today — Android fires
      // past-dated notifications immediately, which is jarring at app open.
      if (at.getTime() <= Date.now()) return null;
      return {
        id: notifId(card.id),
        title: 'Payment due soon',
        body: `${card.nickname} payment is due in ${daysBefore} days`,
        schedule: { at },
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
