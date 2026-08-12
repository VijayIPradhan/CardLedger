import { describe, it, expect } from 'vitest';
import {
  computeFriendDebts,
  type DebtCardPayment,
  type DebtHolder,
  type DebtPayment,
  type DebtTransaction,
} from './debtEngine.js';

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
    txn_date: '2026-06-01',
    ...over,
  };
}

function run(
  holders: DebtHolder[],
  transactions: DebtTransaction[],
  payments: DebtPayment[] = [],
  cardPayments: DebtCardPayment[] = [],
) {
  return computeFriendDebts({ holders, transactions, payments, cardPayments });
}

describe('computeFriendDebts — scope', () => {
  it('ignores holders who are not friends', () => {
    const r = run(
      [ME, ALICE],
      [
        txn({ id: 't1', holder_id_at_time: 'me', amount: 5000 }),
        txn({ id: 't2', holder_id_at_time: 'alice', amount: 1000 }),
      ],
    );
    expect(r.friendDebts).toHaveLength(1);
    expect(r.totalToCollect).toBe(1000);
  });

  it('returns zeroes when there are no friends', () => {
    const r = run([ME], [txn({ id: 't1', holder_id_at_time: 'me', amount: 5000 })]);
    expect(r.friendDebts).toEqual([]);
    expect(r.totalToCollect).toBe(0);
    expect(r.friendAdvanceInHand).toBe(0);
  });
});

describe('computeFriendDebts — what a friend owes', () => {
  it('counts spend as to-collect', () => {
    const r = run([ALICE], [txn({ id: 't1', amount: 1000 })]);
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].rawByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 1000 });
  });

  it('keeps the debt when a transaction is marked paid to the bank', () => {
    // is_paid means "the bill was paid", not "the friend settled up". Paying the bank out of
    // your own pocket does not make the friend's money appear.
    const r = run([ALICE], [txn({ id: 't1', amount: 1000, is_paid: true })]);
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
    expect(r.totalToCollect).toBe(1000);
    expect(r.friendDebts[0].totalSpend).toBe(1000);
    expect(r.friendDebts[0].remainingToPay).toBe(1000);
  });

  it('nets refunds out of both gross and collectable spend', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 }), txn({ id: 't2', amount: 250, type: 'refund' })],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 750 });
    expect(r.friendDebts[0].totalSpend).toBe(750);
  });

  it('ignores transaction types other than spend and refund', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 }), txn({ id: 't2', amount: 400, type: 'bill_payment' })],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
  });
});

describe('computeFriendDebts — cash payments', () => {
  it('reduces the overall balance for unlinked cash but leaves per-card debt alone', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 400 }],
    );
    expect(r.friendDebts[0].totalPaid).toBe(400);
    expect(r.friendDebts[0].remainingToPay).toBe(600);
    // Unlinked cash isn't attributable to a card, so the card still shows the full amount.
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
  });

  it('reduces per-card debt when linked to an unpaid transaction', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 400 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 600 });
  });

  it('applies cash linked to a transaction whose bill is already paid', () => {
    // t1's bill went to the bank but Alice still owed it, so her 1000 clears exactly t1 and
    // t2's 500 survives untouched.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000, is_paid: true }), txn({ id: 't2', amount: 500 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 1000 }],
    );
    expect(r.friendDebts[0].rawByCard).toEqual({ cardA: 1500 });
    expect(r.toCollectByCard).toEqual({ cardA: 500 });
  });

  it('attributes a linked payment to the transaction’s card, not the payment’s', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', card_id: 'cardB', amount: 700 }), txn({ id: 't2', amount: 300 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 700 }],
    );
    // cardB settles to zero and is therefore absent: toCollectByCard only carries cards with
    // outstanding debt, so consumers must read a missing key as zero.
    expect(r.toCollectByCard).toEqual({ cardA: 300 });
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 300, cardB: 0 });
  });
});

describe('computeFriendDebts — card payments never touch debt', () => {
  it('leaves both the balance and the per-card debt untouched when unlinked', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 400 }],
    );
    // The bank got 400, but Alice has handed over nothing, so she still owes the lot.
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].totalSpend).toBe(1000);
    expect(r.friendDebts[0].remainingToPay).toBe(1000);
  });

  it('leaves the per-card debt untouched when linked to a transaction', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', transaction_id: 't1', amount: 250 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
  });

  it('does not double-count cash that has been forwarded to the bank', () => {
    // The normal flow: Alice transfers 1000, then you pay the bill with it. Counting the card
    // payment as well would put her 1000 in credit.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    );
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 0 });
    expect(r.totalToCollect).toBe(0);
    expect(r.friendAdvanceInHand).toBe(0);
  });

  it('no longer claws another friend’s debt off the card total', () => {
    // Bob is processed first, so the old double-count drove Alice 1000 into fake credit and
    // the overshoot rule wiped Bob's real 500 off cardA.
    const r = run(
      [BOB, ALICE],
      [
        txn({ id: 't1', holder_id_at_time: 'bob', amount: 500 }),
        txn({ id: 't2', holder_id_at_time: 'alice', amount: 1000 }),
      ],
      [{ holder_id: 'alice', transaction_id: 't2', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 500 });
  });
});

describe('computeFriendDebts — overshoot clawback', () => {
  it('claws back credit from the card total when one friend overpays', () => {
    // Alice owes 1000 on cardA. Bob has a 300 refund there and no spend, so he is 300 in
    // credit; the card's collectable total must drop to 700 rather than stay at 1000.
    const r = run(
      [ALICE, BOB],
      [
        txn({ id: 't1', holder_id_at_time: 'alice', amount: 1000 }),
        txn({ id: 't2', holder_id_at_time: 'bob', amount: 300, type: 'refund' }),
      ],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 700 });
    expect(r.friendDebts.find((d) => d.holderId === 'bob')!.byCard).toEqual({ cardA: 0 });
  });

  it('never drives a card total below zero', () => {
    const r = run(
      [ALICE, BOB],
      [
        txn({ id: 't1', holder_id_at_time: 'alice', amount: 100 }),
        txn({ id: 't2', holder_id_at_time: 'bob', amount: 900, type: 'refund' }),
      ],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 0 });
  });

  it('floors an individual friend’s per-card debt at zero', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 100 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 500 }],
    );
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 0 });
  });
});

describe('computeFriendDebts — advance in hand', () => {
  it('holds all collected cash until it is forwarded to a bank', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 800 }],
    );
    expect(r.friendAdvanceInHand).toBe(800);
  });

  it('falls by each card payment made out of that cash', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 1500 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 500 }],
    );
    expect(r.friendAdvanceInHand).toBe(1000);
  });

  it('is not consumed by marking a transaction paid to the bank', () => {
    // Settling the bill from your own funds does not spend the friend's cash — you are still
    // holding it, so it is still an advance.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000, is_paid: true })],
      [{ holder_id: 'alice', amount: 800 }],
    );
    expect(r.friendAdvanceInHand).toBe(800);
  });

  it('never goes negative when more was forwarded than was collected', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 500 }],
    );
    expect(r.friendAdvanceInHand).toBe(0);
  });
});

describe('computeFriendDebts — aggregates and shape', () => {
  it('sorts friends by outstanding balance, largest first', () => {
    const r = run(
      [ALICE, BOB],
      [
        txn({ id: 't1', holder_id_at_time: 'alice', amount: 100 }),
        txn({ id: 't2', holder_id_at_time: 'bob', amount: 900 }),
      ],
    );
    expect(r.friendDebts.map((d) => d.holderId)).toEqual(['bob', 'alice']);
  });

  it('totals to-collect across cards and defaults a missing phone to empty string', () => {
    const noPhone: DebtHolder = { id: 'carol', name: 'Carol', relationship: 'friend' };
    const r = run(
      [noPhone],
      [
        txn({ id: 't1', holder_id_at_time: 'carol', card_id: 'cardA', amount: 100 }),
        txn({ id: 't2', holder_id_at_time: 'carol', card_id: 'cardB', amount: 250 }),
      ],
    );
    expect(r.totalToCollect).toBe(350);
    expect(r.friendDebts[0].phone).toBe('');
  });

  it('parses string amounts and tolerates malformed ones', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: '1000.50' }), txn({ id: 't2', amount: 'not-a-number' })],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 1000.5 });
  });

  it('keeps per-card money rounded to two decimals', () => {
    const r = run([ALICE], [txn({ id: 't1', amount: '0.1' }), txn({ id: 't2', amount: '0.2' })]);
    expect(r.toCollectByCard).toEqual({ cardA: 0.3 });
  });
});
