import { getDaysUntilDue } from './billingCycle.js';

export interface Utilization {
  spend: number;
  limit: number;
  percent: number; // 1-decimal; 0 when limit <= 0
}

export interface UpcomingDue {
  cardId: string;
  dueDate: string; // ISO yyyy-MM-dd
  daysUntil: number;
}

function pct(spend: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((spend / limit) * 1000) / 10;
}

export function getCardUtilization(creditLimit: number, cycleSpend: number): Utilization {
  return { spend: cycleSpend, limit: creditLimit, percent: pct(cycleSpend, creditLimit) };
}

export function getTotalUtilization(
  cards: { id: string; credit_limit: number }[],
  spendByCardId: Record<string, number>,
): Utilization {
  const limit = cards.reduce((s, c) => s + c.credit_limit, 0);
  const spend = cards.reduce((s, c) => s + (spendByCardId[c.id] ?? 0), 0);
  return { spend, limit, percent: pct(spend, limit) };
}

export function getUpcomingDues(
  cards: { id: string; payment_due_day: number }[],
  today: string,
  withinDays: number,
): UpcomingDue[] {
  const [y, m, d] = today.split('-').map(Number);
  return cards
    .map((card) => {
      let dueYear = y;
      let dueMonth = m;
      if (d > card.payment_due_day) {
        dueMonth += 1;
        if (dueMonth === 13) {
          dueMonth = 1;
          dueYear += 1;
        }
      }
      const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(
        card.payment_due_day,
      ).padStart(2, '0')}`;
      return {
        cardId: card.id,
        dueDate,
        daysUntil: getDaysUntilDue(card.payment_due_day, today),
      };
    })
    .filter((x) => x.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
