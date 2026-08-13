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
    expect(r.friendDebts[0].unpaidByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 1000 });
  });

  it('drops settled spend off the card but keeps it in the friend’s balance', () => {
    // Flagging a bill paid is how this ledger marks a transaction finished with, so the card
    // has nothing left to collect. Alice's own balance is a separate question and unaffected:
    // paying the bank out of your own pocket does not make her money appear.
    const r = run([ALICE], [txn({ id: 't1', amount: 1000, is_paid: true })]);
    expect(r.toCollectByCard).toEqual({});
    expect(r.totalToCollect).toBe(0);
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 0 });
    expect(r.friendDebts[0].rawByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].unpaidByCard).toEqual({ cardA: 0 });
    expect(r.friendDebts[0].totalSpend).toBe(1000);
    expect(r.friendDebts[0].remainingToPay).toBe(1000);
  });

  it('keeps unpaidByCard on a pre-settlement basis, unlike byCard', () => {
    // This pair is what a card tile shows — "of this much still on the card, this much is left
    // to collect" — so cash and card payments move byCard only.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', transaction_id: 't1', amount: 100 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 300 }],
    );
    expect(r.friendDebts[0].unpaidByCard).toEqual({ cardA: 1000 });
    expect(r.friendDebts[0].byCard).toEqual({ cardA: 600 });
  });

  it('floors unpaidByCard at zero when refunds outrun unsettled spend', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 100 }), txn({ id: 't2', amount: 400, type: 'refund' })],
    );
    expect(r.friendDebts[0].unpaidByCard).toEqual({ cardA: 0 });
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

  it('does not deduct cash linked to an already settled transaction twice', () => {
    // t1 is settled, so it is out of the card's figure on that basis alone. Subtracting its
    // 1000 of cash on top would wrongly eat into t2's 500.
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

describe('computeFriendDebts — card payments settle a card', () => {
  it('lowers the per-card figure but not the friend’s balance', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 400 }],
    );
    // 400 of this card is dealt with, so 600 is left to collect for it. Alice herself has
    // handed over nothing, so she still owes the full 1000.
    expect(r.toCollectByCard).toEqual({ cardA: 600 });
    expect(r.friendDebts[0].totalSpend).toBe(1000);
    expect(r.friendDebts[0].remainingToPay).toBe(1000);
  });

  it('settles the card it names, whatever transaction it points at', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', transaction_id: 't1', amount: 250 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 750 });
  });

  it('only settles the card it names', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 }), txn({ id: 't2', card_id: 'cardB', amount: 800 })],
      [],
      [{ card_id: 'cardB', holder_id: 'alice', amount: 300 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 1000, cardB: 500 });
  });

  it('only settles the friend it names', () => {
    const r = run(
      [ALICE, BOB],
      [
        txn({ id: 't1', holder_id_at_time: 'alice', amount: 1000 }),
        txn({ id: 't2', holder_id_at_time: 'bob', amount: 600 }),
      ],
      [],
      [{ card_id: 'cardA', holder_id: 'bob', amount: 600 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 1000 });
  });

  it('stops at zero rather than clawing another friend’s debt off the card', () => {
    // Bob is processed first. Over-forwarding for Alice must not wipe out Bob's real 500.
    const r = run(
      [BOB, ALICE],
      [
        txn({ id: 't1', holder_id_at_time: 'bob', amount: 500 }),
        txn({ id: 't2', holder_id_at_time: 'alice', amount: 1000 }),
      ],
      [],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 4000 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 500 });
  });

  it('matches the real ledger: unsettled spend less the card payment', () => {
    // The ICICI Coral case that surfaced this rule — 4 unsettled spends totalling 102,734.82
    // against one 4,795 card payment.
    const r = run(
      [ALICE],
      [
        txn({ id: 't1', amount: 52734.82 }),
        txn({ id: 't2', amount: 20000 }),
        txn({ id: 't3', amount: 20000 }),
        txn({ id: 't4', amount: 10000 }),
        txn({ id: 't5', amount: 336752.82, is_paid: true }),
      ],
      [{ holder_id: 'alice', transaction_id: 't5', amount: 96514 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 4795 }],
    );
    expect(r.toCollectByCard).toEqual({ cardA: 97939.82 });
  });
});

describe('computeFriendDebts — refund credit clawback', () => {
  it('claws back credit from the card total when one friend is refunded', () => {
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
  it('holds all collected cash while no bill has been settled', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 800 }],
    );
    expect(r.friendAdvanceInHand).toBe(800);
  });

  it('falls as bills are settled out of that cash', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 500, is_paid: true }), txn({ id: 't2', amount: 1000 })],
      [{ holder_id: 'alice', amount: 1500 }],
    );
    expect(r.friendAdvanceInHand).toBe(1000);
  });

  it('falls when collected cash is forwarded to a bank as a card payment', () => {
    // Recording a card payment against unsettled spend is the one case is_paid cannot see: the
    // cash has left, so it must come off the advance. The friend's own balance is untouched.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 600 }],
    );
    expect(r.friendAdvanceInHand).toBe(400);
    expect(r.friendRemainingToPay).toBe(0);
  });

  it('deducts a card payment only as far as there is unsettled spend to pay off', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 400 })],
      [{ holder_id: 'alice', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 900 }],
    );
    expect(r.friendAdvanceInHand).toBe(600);
  });

  it('stops counting a card payment once its spend is flagged settled', () => {
    // Otherwise the same outflow would be subtracted twice — once as settled spend and once as
    // the card payment — and the advance would collapse to zero the moment a bill was flagged.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 600, is_paid: true }), txn({ id: 't2', amount: 400 })],
      [{ holder_id: 'alice', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 600 }],
    );
    // 1000 collected, 600 settled, and the card payment covers 400 of the 400 still unsettled.
    expect(r.friendAdvanceInHand).toBe(0);
  });

  it('is measured by settled spend, not by card_payments rows', () => {
    // Only a fraction of bills paid ever get a card_payments row, so metering the outflow by
    // them reports cash in hand that went to the bank long ago.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000, is_paid: true })],
      [{ holder_id: 'alice', amount: 1000 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    );
    expect(r.friendAdvanceInHand).toBe(0);
  });

  it('nets refunds out of what has been settled', () => {
    const r = run(
      [ALICE],
      [
        txn({ id: 't1', amount: 1000, is_paid: true }),
        txn({ id: 't2', amount: 300, type: 'refund', is_paid: true }),
      ],
      [{ holder_id: 'alice', amount: 1000 }],
    );
    expect(r.friendAdvanceInHand).toBe(300);
  });

  it('goes negative when a bill was settled before the cash came in', () => {
    // Out of my own pocket by the full 1000. Flooring this at zero made being square and being
    // 1000 down look identical, and paying a bill early is exactly when I need to see which.
    const r = run([ALICE], [txn({ id: 't1', amount: 1000, is_paid: true })], []);
    expect(r.friendAdvanceInHand).toBe(-1000);
    // The friend still owes the full amount: me paying the bank is not them paying me.
    expect(r.friendRemainingToPay).toBe(1000);
  });

  it('offsets the pocket against cash already collected', () => {
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000, is_paid: true })],
      [{ holder_id: 'alice', amount: 700 }],
    );
    expect(r.friendAdvanceInHand).toBe(-300);
  });

  it('goes negative when a card payment ran ahead of the cash too', () => {
    // Same overspend, reached via card_payments rather than the is_paid flag.
    const r = run(
      [ALICE],
      [txn({ id: 't1', amount: 1000 })],
      [{ holder_id: 'alice', amount: 250 }],
      [{ card_id: 'cardA', holder_id: 'alice', amount: 1000 }],
    );
    expect(r.friendAdvanceInHand).toBe(-750);
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
