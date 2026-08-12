import { describe, it, expect } from 'vitest';
import { getCardUtilization, getTotalUtilization, getUpcomingDues } from './analytics.js';

describe('getCardUtilization', () => {
  it('computes percent to one decimal', () => {
    expect(getCardUtilization(10000, 5000)).toEqual({ spend: 5000, limit: 10000, percent: 50 });
  });
  it('returns 0 percent when limit is 0', () => {
    expect(getCardUtilization(0, 500)).toEqual({ spend: 500, limit: 0, percent: 0 });
  });
  it('allows over 100 percent', () => {
    expect(getCardUtilization(1000, 1500).percent).toBe(150);
  });
});

describe('getTotalUtilization', () => {
  it('aggregates across cards', () => {
    const cards = [
      { id: 'a', credit_limit: 10000 },
      { id: 'b', credit_limit: 20000 },
    ];
    const spend = { a: 5000, b: 5000 };
    expect(getTotalUtilization(cards, spend)).toEqual({
      spend: 10000,
      limit: 30000,
      percent: 33.3,
    });
  });
  it('returns zeros for no cards', () => {
    expect(getTotalUtilization([], {})).toEqual({ spend: 0, limit: 0, percent: 0 });
  });
});

describe('getUpcomingDues', () => {
  it('includes a due day later this month with correct daysUntil', () => {
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 9 }], '2026-06-06', 7);
    expect(dues).toEqual([{ cardId: 'a', dueDate: '2026-06-09', daysUntil: 3 }]);
  });
  it('rolls a passed due day into next month', () => {
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 5 }], '2026-06-06', 40);
    expect(dues[0].dueDate).toBe('2026-07-05');
  });
  it('excludes cards outside the window', () => {
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 25 }], '2026-06-06', 7);
    expect(dues).toEqual([]);
  });
  it('sorts ascending by daysUntil', () => {
    const cards = [
      { id: 'far', payment_due_day: 12 },
      { id: 'near', payment_due_day: 8 },
    ];
    const dues = getUpcomingDues(cards, '2026-06-06', 10);
    expect(dues.map((d) => d.cardId)).toEqual(['near', 'far']);
  });
});
