import { describe, it, expect } from 'vitest';
import {
  buildCycleGroups,
  computeCardDetail,
  computeHolderDetails,
  shiftMonths,
  type CycleTransaction,
} from './cardDetail.js';
import type { DebtHolder, DebtTransaction } from './debtEngine.js';

const ME: DebtHolder = { id: 'me', name: 'Me', relationship: 'me' };
const ALICE: DebtHolder = { id: 'alice', name: 'Alice', phone: '111', relationship: 'friend' };
const BOB: DebtHolder = { id: 'bob', name: 'Bob', phone: '222', relationship: 'friend' };

function txn(over: Partial<DebtTransaction> & { id: string }): DebtTransaction {
  return {
    card_id: 'cardA',
    holder_id_at_time: 'alice',
    amount: 0,
    type: 'spend',
    is_paid: false,
    txn_date: '2026-06-10',
    ...over,
  };
}

describe('shiftMonths', () => {
  it('walks backwards across a year boundary', () => {
    expect(shiftMonths('2026-02-15', -3)).toBe('2025-11-15');
  });

  it('clamps the day to the target month length', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2024-03-31', -1)).toBe('2024-02-29');
  });

  it('is the identity for a zero shift', () => {
    expect(shiftMonths('2026-08-11', 0)).toBe('2026-08-11');
  });
});

describe('buildCycleGroups', () => {
  const cycleDay = 5;

  function cyc(over: Partial<CycleTransaction> & { id: string }): CycleTransaction {
    return { txn_date: '2026-08-10', type: 'spend', is_paid: false, amount: 100, ...over };
  }

  it('returns nothing for a card with no transactions', () => {
    expect(buildCycleGroups(cycleDay, [], '2026-08-11')).toEqual([]);
  });

  it('groups by cycle, newest first, and nets refunds into the cycle total', () => {
    const groups = buildCycleGroups(
      cycleDay,
      [
        cyc({ id: 'a', txn_date: '2026-08-10', amount: 500 }),
        cyc({ id: 'b', txn_date: '2026-08-06', amount: 100, type: 'refund' }),
        cyc({ id: 'c', txn_date: '2026-07-20', amount: 300 }),
      ],
      '2026-08-11',
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].start).toBe('2026-08-05');
    expect(groups[0].total).toBe(400);
    expect(groups[0].transactionIds).toEqual(['a', 'b']);
    expect(groups[1].start).toBe('2026-07-05');
    expect(groups[1].total).toBe(300);
  });

  it('skips cycles with no activity instead of emitting empty groups', () => {
    const groups = buildCycleGroups(
      cycleDay,
      [cyc({ id: 'a', txn_date: '2026-08-10' }), cyc({ id: 'b', txn_date: '2026-05-10' })],
      '2026-08-11',
    );
    expect(groups.map((g) => g.start)).toEqual(['2026-08-05', '2026-05-05']);
  });

  it('counts only unpaid spend towards unpaidCount', () => {
    const groups = buildCycleGroups(
      cycleDay,
      [
        cyc({ id: 'a', is_paid: false }),
        cyc({ id: 'b', is_paid: true }),
        cyc({ id: 'c', is_paid: false, type: 'refund' }),
      ],
      '2026-08-11',
    );
    expect(groups[0].unpaidCount).toBe(1);
  });

  it('excludes bill payments from the cycle total but keeps them in the list', () => {
    const groups = buildCycleGroups(
      cycleDay,
      [cyc({ id: 'a', amount: 500 }), cyc({ id: 'b', amount: 500, type: 'bill_payment' })],
      '2026-08-11',
    );
    expect(groups[0].total).toBe(500);
    expect(groups[0].transactionIds).toHaveLength(2);
  });

  it('puts a transaction older than the walk-back limit in a trailing bucket', () => {
    const groups = buildCycleGroups(
      cycleDay,
      [cyc({ id: 'old', txn_date: '2015-01-01', amount: 50 })],
      '2026-08-11',
      12,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Earlier transactions');
    expect(groups[0].start).toBeNull();
    expect(groups[0].total).toBe(50);
  });

  it('assigns a future-dated transaction to the cycle in progress', () => {
    // Without an open-ended current cycle this row would fall through every past cycle and be
    // mislabelled as "Earlier transactions".
    const groups = buildCycleGroups(
      cycleDay,
      [cyc({ id: 'future', txn_date: '2026-12-25', amount: 90 })],
      '2026-08-11',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].start).toBe('2026-08-05');
    expect(groups[0].transactionIds).toEqual(['future']);
  });
});

describe('computeCardDetail', () => {
  const base = {
    cardId: 'cardA',
    billingCycleDay: 1,
    assignments: [],
    today: '2026-06-20',
  };

  it('reports to-collect for the requested card only', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ME, ALICE],
      transactions: [
        txn({ id: 't1', amount: 1000 }),
        txn({ id: 't2', card_id: 'cardB', amount: 400 }),
      ],
      payments: [],
      cardPayments: [],
    });
    expect(r.toCollect).toBe(1000);
    expect(r.friendBreakdown).toEqual([
      { holderId: 'alice', holderName: 'Alice', owed: 1000, collectedInHand: 0, usage: 1000 },
    ]);
  });

  it('lowers to-collect when a card payment settles the bank', () => {
    // The card is dealt with, so nothing is left to collect for it. Alice has still handed
    // over no cash, which is why collectedInHand stays at zero.
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 1000 })],
      payments: [],
      cardPayments: [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    });
    expect(r.toCollect).toBe(0);
    expect(r.friendBreakdown[0]).toMatchObject({ owed: 0, collectedInHand: 0, usage: 1000 });
  });

  it('surfaces cash collected against this card per friend and per transaction', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 1000 })],
      payments: [{ holder_id: 'alice', transaction_id: 't1', amount: 250 }],
      cardPayments: [],
    });
    expect(r.toCollect).toBe(750);
    expect(r.collectedInHand).toBe(250);
    expect(r.collectedByTransaction).toEqual({ t1: 250 });
    expect(r.friendBreakdown[0]).toMatchObject({ owed: 750, collectedInHand: 250, usage: 1000 });
  });

  it('ignores cash linked to a transaction on another card', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [
        txn({ id: 't1', amount: 1000 }),
        txn({ id: 't2', card_id: 'cardB', amount: 500 }),
      ],
      payments: [{ holder_id: 'alice', transaction_id: 't2', amount: 500 }],
      cardPayments: [],
    });
    expect(r.collectedInHand).toBe(0);
    expect(r.collectedByTransaction).toEqual({});
    expect(r.toCollect).toBe(1000);
  });

  it('still lists a friend who has paid in full, so the collected chip survives', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 1000 })],
      payments: [{ holder_id: 'alice', transaction_id: 't1', amount: 1000 }],
      cardPayments: [],
    });
    expect(r.toCollect).toBe(0);
    expect(r.friendBreakdown[0]).toMatchObject({ owed: 0, collectedInHand: 1000 });
  });

  it('reports friend usage the clients can no longer derive themselves', () => {
    // A settled bill drops out of usage entirely — it is done with. What remains is the 400 that
    // is still on the card, which toCollect + collectedInHand happens to reproduce here only
    // because no cash has come in against it yet.
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 900, is_paid: true }), txn({ id: 't2', amount: 400 })],
      payments: [{ holder_id: 'alice', amount: 900 }],
      cardPayments: [],
    });
    expect(r.toCollect).toBe(400);
    expect(r.collectedInHand).toBe(0);
    expect(r.friendUsage).toBe(400);
  });

  it('keeps usage on an unpaid basis while owed reflects only what is still uncollected', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 1000 }), txn({ id: 't2', amount: 300 })],
      payments: [{ holder_id: 'alice', transaction_id: 't1', amount: 1000 }],
      cardPayments: [],
    });
    // Cash received does not retire spend from the card; only paying the bank does. So usage
    // stays at 1300 and owed is what is left of it.
    expect(r.friendBreakdown[0]).toMatchObject({ owed: 300, usage: 1300 });
    expect(r.friendUsage).toBe(1300);
  });

  it('bills only the current cycle to friendCycleUsage', () => {
    // Cycle day 1 and today 2026-06-20, so the cycle in progress is June.
    const r = computeCardDetail({
      ...base,
      holders: [ME, ALICE],
      transactions: [
        txn({ id: 'june', amount: 500 }),
        txn({ id: 'june-refund', amount: 200, type: 'refund' }),
        txn({ id: 'future', amount: 100, txn_date: '2026-09-02' }),
        txn({ id: 'may', amount: 700, txn_date: '2026-05-15' }),
        txn({ id: 'mine', amount: 900, holder_id_at_time: 'me' }),
      ],
      payments: [],
      cardPayments: [],
    });
    // 500 - 200 + 100: May is a past cycle, and my own spend is not friend usage. The unpaid
    // figure carries every cycle, so the two deliberately disagree.
    expect(r.friendCycleUsage).toBe(400);
    expect(r.friendUsage).toBe(1100);
  });

  it('leaves friendCycleUsage at zero once the cycle rolls over', () => {
    const r = computeCardDetail({
      ...base,
      today: '2026-08-20',
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 500 })],
      payments: [],
      cardPayments: [],
    });
    expect(r.friendCycleUsage).toBe(0);
    expect(r.friendUsage).toBe(500);
  });

  it('resolves the current holder from the active assignment', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ME, ALICE, BOB],
      transactions: [],
      payments: [],
      cardPayments: [],
      assignments: [
        { card_id: 'cardA', holder_id: 'bob', returned_date: '2026-01-01' },
        { card_id: 'cardA', holder_id: 'alice', returned_date: null },
      ],
    });
    expect(r.currentHolderId).toBe('alice');
  });

  it('falls back to me when no assignment is active', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ME, ALICE],
      transactions: [],
      payments: [],
      cardPayments: [],
      assignments: [{ card_id: 'cardA', holder_id: 'alice', returned_date: '2026-01-01' }],
    });
    expect(r.currentHolderId).toBe('me');
  });

  it('builds cycles from this card’s transactions only', () => {
    const r = computeCardDetail({
      ...base,
      holders: [ALICE],
      transactions: [
        txn({ id: 't1', amount: 100, txn_date: '2026-06-10' }),
        txn({ id: 't2', card_id: 'cardB', amount: 900, txn_date: '2026-06-11' }),
      ],
      payments: [],
      cardPayments: [],
    });
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].total).toBe(100);
    expect(r.cycles[0].transactionIds).toEqual(['t1']);
  });
});

describe('computeHolderDetails', () => {
  it('returns one row per friend with outstanding from the debt engine', () => {
    const rows = computeHolderDetails({
      holders: [ME, ALICE],
      transactions: [
        txn({ id: 't1', holder_id_at_time: 'me', amount: 9999 }),
        txn({ id: 't2', amount: 1000 }),
      ],
      payments: [{ holder_id: 'alice', amount: 400 }],
      cardPayments: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      holderId: 'alice',
      holderName: 'Alice',
      phone: '111',
      relationship: 'friend',
      totalSpend: 1000,
      totalPaid: 400,
      outstanding: 600,
    });
  });

  it('breaks down gross and collectable amounts per card, biggest usage first', () => {
    const rows = computeHolderDetails({
      holders: [ALICE],
      transactions: [
        txn({ id: 't1', card_id: 'cardA', amount: 300 }),
        txn({ id: 't2', card_id: 'cardB', amount: 800 }),
      ],
      payments: [{ holder_id: 'alice', transaction_id: 't2', amount: 800 }],
      cardPayments: [],
    });
    expect(rows[0].byCard).toEqual([
      { cardId: 'cardB', unpaidAmount: 0, grossAmount: 800 },
      { cardId: 'cardA', unpaidAmount: 300, grossAmount: 300 },
    ]);
  });

  it('nets refunds out of the gross per-card figure', () => {
    const rows = computeHolderDetails({
      holders: [ALICE],
      transactions: [
        txn({ id: 't1', amount: 500 }),
        txn({ id: 't2', amount: 200, type: 'refund' }),
      ],
      payments: [],
      cardPayments: [],
    });
    expect(rows[0].byCard).toEqual([{ cardId: 'cardA', unpaidAmount: 300, grossAmount: 300 }]);
  });

  it('excludes bill payments from the gross per-card figure', () => {
    const rows = computeHolderDetails({
      holders: [ALICE],
      transactions: [
        txn({ id: 't1', amount: 500 }),
        txn({ id: 't2', amount: 500, type: 'bill_payment' }),
      ],
      payments: [],
      cardPayments: [],
    });
    expect(rows[0].byCard).toEqual([{ cardId: 'cardA', unpaidAmount: 500, grossAmount: 500 }]);
  });

  it('lets a card payment clear the card without clearing the friend', () => {
    // The two columns answer different questions: the card has nothing left to collect for,
    // while Alice has handed over nothing and so still owes the full 1000.
    const rows = computeHolderDetails({
      holders: [ALICE],
      transactions: [txn({ id: 't1', amount: 1000 })],
      payments: [],
      cardPayments: [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    });
    expect(rows[0].outstanding).toBe(1000);
    expect(rows[0].byCard).toEqual([{ cardId: 'cardA', unpaidAmount: 0, grossAmount: 1000 }]);
  });

  it('returns an empty list when there are no friends', () => {
    const rows = computeHolderDetails({
      holders: [ME],
      transactions: [txn({ id: 't1', holder_id_at_time: 'me', amount: 100 })],
      payments: [],
      cardPayments: [],
    });
    expect(rows).toEqual([]);
  });
});
