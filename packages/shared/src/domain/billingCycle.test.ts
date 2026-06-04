import { describe, it, expect } from 'vitest';
import { getCycleRange, getDaysUntilDue } from './billingCycle.js';

describe('getCycleRange', () => {
  it('returns current cycle where cycle_day is 5 and today is mid-cycle', () => {
    const { start, end } = getCycleRange(5, '2025-06-10');
    expect(start).toBe('2025-06-05');
    expect(end).toBe('2025-07-04');
  });

  it('handles cycle_day after today — rolls back to previous month', () => {
    const { start, end } = getCycleRange(20, '2025-06-10');
    expect(start).toBe('2025-05-20');
    expect(end).toBe('2025-06-19');
  });
});

describe('getDaysUntilDue', () => {
  it('returns positive days when due date is in future', () => {
    const days = getDaysUntilDue(15, '2025-06-10');
    expect(days).toBe(5);
  });

  it('returns 0 on the due day itself', () => {
    expect(getDaysUntilDue(10, '2025-06-10')).toBe(0);
  });
});
