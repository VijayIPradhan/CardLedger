import { describe, it, expect } from 'vitest';
import { resolveHolder } from './resolveHolder.js';
import type { Assignment } from '../models/index.js';

const ME = 'holder-me';
const FRIEND = 'holder-friend';
const CARD = 'card-1';

const assignments: Assignment[] = [
  {
    id: 'a1', card_id: CARD, holder_id: ME,
    handed_over_date: '2025-01-01', returned_date: '2025-04-30',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'a2', card_id: CARD, holder_id: FRIEND,
    handed_over_date: '2025-05-01', returned_date: null,
    created_at: '2025-05-01T00:00:00Z',
  },
];

describe('resolveHolder', () => {
  it('returns me for a date before handover', () => {
    expect(resolveHolder(CARD, '2025-03-15', assignments)).toBe(ME);
  });

  it('returns friend for a date after handover', () => {
    expect(resolveHolder(CARD, '2025-05-10', assignments)).toBe(FRIEND);
  });

  it('returns friend for today when not yet returned', () => {
    expect(resolveHolder(CARD, '2025-12-01', assignments)).toBe(FRIEND);
  });

  it('returns null when no assignment covers the date', () => {
    expect(resolveHolder(CARD, '2024-12-31', assignments)).toBeNull();
  });

  it('returns null for a different card', () => {
    expect(resolveHolder('card-other', '2025-05-10', assignments)).toBeNull();
  });
});
