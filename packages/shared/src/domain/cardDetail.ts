/**
 * Per-card and per-holder detail views, computed server-side.
 *
 * These sit on top of {@link computeFriendDebts} so the card screen and the dashboard can
 * never disagree about what a friend owes. Everything here is pure: `today` is injected and
 * all date arithmetic is ISO-string based, so the same input always yields the same output.
 */

import { getCycleRange } from './billingCycle.js';
import {
  computeFriendDebts,
  money,
  roundMoney,
  type DebtCardPayment,
  type DebtHolder,
  type DebtPayment,
  type DebtTransaction,
} from './debtEngine.js';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month1 - 1];
}

/**
 * Shifts an ISO date by whole months, clamping the day so 2026-03-31 minus one month is
 * 2026-02-28 rather than an invalid date. Done with string math on purpose — `new Date()`
 * would drag local-timezone behaviour into a pure function.
 */
export function shiftMonths(today: string, months: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

export interface CycleTransaction {
  id: string;
  txn_date: string;
  type: string;
  is_paid: boolean;
  amount: number | string;
}

export interface CardCycleGroup {
  label: string;
  /** null for the catch-all "Earlier transactions" bucket. */
  start: string | null;
  end: string | null;
  transactionIds: string[];
  /** Spend less refunds within the cycle. Bill payments are excluded. */
  total: number;
  unpaidCount: number;
}

/**
 * Groups a card's transactions into billing cycles, newest first.
 *
 * Walks back month by month from `today` and stops once every transaction has been placed —
 * anything left (dates older than the walk-back limit) lands in a trailing bucket so a
 * transaction can never silently vanish from the history list.
 */
export function buildCycleGroups(
  cycleDay: number,
  txns: CycleTransaction[],
  today: string,
  maxMonthsBack = 36,
): CardCycleGroup[] {
  const out: CardCycleGroup[] = [];
  if (txns.length === 0) return out;

  const oldest = txns.reduce((min, t) => (t.txn_date < min ? t.txn_date : min), txns[0].txn_date);
  const assigned = new Set<string>();

  for (let offset = 0; offset >= -maxMonthsBack; offset--) {
    const range = getCycleRange(cycleDay, shiftMonths(today, offset));
    // The current cycle has no upper bound: a future-dated transaction belongs to the cycle
    // in progress, not to the "Earlier" bucket it would otherwise fall through to.
    const inCycle = txns.filter(
      (t) => t.txn_date >= range.start && (offset === 0 || t.txn_date <= range.end),
    );

    if (inCycle.length > 0) {
      out.push({
        label: `${range.start} – ${range.end}`,
        start: range.start,
        end: range.end,
        transactionIds: sortedIds(inCycle),
        total: cycleTotal(inCycle),
        unpaidCount: inCycle.filter((t) => t.type === 'spend' && !t.is_paid).length,
      });
      inCycle.forEach((t) => assigned.add(t.id));
    }

    if (range.start < oldest && assigned.size === txns.length) break;
  }

  const remaining = txns.filter((t) => !assigned.has(t.id));
  if (remaining.length > 0) {
    out.push({
      label: 'Earlier transactions',
      start: null,
      end: null,
      transactionIds: sortedIds(remaining),
      total: cycleTotal(remaining),
      unpaidCount: remaining.filter((t) => t.type === 'spend' && !t.is_paid).length,
    });
  }

  return out;
}

function sortedIds(txns: CycleTransaction[]): string[] {
  return [...txns].sort((a, b) => b.txn_date.localeCompare(a.txn_date)).map((t) => t.id);
}

function cycleTotal(txns: CycleTransaction[]): number {
  return roundMoney(
    txns.reduce((sum, t) => {
      if (t.type === 'spend') return sum + money(t.amount);
      if (t.type === 'refund') return sum - money(t.amount);
      return sum;
    }, 0),
  );
}

export interface CardFriendBreakdown {
  holderId: string;
  holderName: string;
  /** Still collectable on this card: unpaid spend less linked payments. */
  owed: number;
  /** Cash already received from this friend against transactions on this card. */
  collectedInHand: number;
  /** Gross usage of this card by this friend, paid or not. */
  usage: number;
}

export interface CardDetailInput {
  cardId: string;
  billingCycleDay: number;
  /** All holders for the user — the engine needs the full set to scope friends. */
  holders: DebtHolder[];
  /** All of the user's transactions. Cross-card context is required for correct debt. */
  transactions: DebtTransaction[];
  payments: DebtPayment[];
  cardPayments: DebtCardPayment[];
  assignments: Array<{ card_id: string; holder_id: string; returned_date?: string | null }>;
  today: string;
}

export interface CardDetailResult {
  cardId: string;
  toCollect: number;
  collectedInHand: number;
  friendBreakdown: CardFriendBreakdown[];
  cycles: CardCycleGroup[];
  currentHolderId: string | null;
  /** Cash received per transaction on this card, for the per-row "collected" chip. */
  collectedByTransaction: Record<string, number>;
}

export function computeCardDetail(input: CardDetailInput): CardDetailResult {
  const { cardId, billingCycleDay, holders, transactions, payments, cardPayments, today } = input;

  const cardTxns = transactions.filter((t) => t.card_id === cardId);
  const cardTxnIds = new Set(cardTxns.map((t) => t.id));

  // Run the full-user computation, then read this card's slice out of it. Restricting the
  // input to one card would break the cross-card payment and overshoot rules.
  const debts = computeFriendDebts({ holders, transactions, payments, cardPayments });

  const collectedByTransaction: Record<string, number> = {};
  for (const p of payments) {
    if (p.transaction_id && cardTxnIds.has(p.transaction_id)) {
      collectedByTransaction[p.transaction_id] = roundMoney(
        (collectedByTransaction[p.transaction_id] || 0) + money(p.amount),
      );
    }
  }

  const grossUsageByHolder = new Map<string, number>();
  for (const t of cardTxns) {
    const amt = money(t.amount);
    if (t.type !== 'spend' && t.type !== 'refund') continue;
    const delta = t.type === 'refund' ? -amt : amt;
    grossUsageByHolder.set(
      t.holder_id_at_time,
      (grossUsageByHolder.get(t.holder_id_at_time) || 0) + delta,
    );
  }

  const inHandByHolder = new Map<string, number>();
  for (const p of payments) {
    if (p.transaction_id && cardTxnIds.has(p.transaction_id)) {
      inHandByHolder.set(p.holder_id, (inHandByHolder.get(p.holder_id) || 0) + money(p.amount));
    }
  }

  const friendBreakdown: CardFriendBreakdown[] = [];
  let toCollect = 0;
  let collectedInHand = 0;

  for (const debt of debts.friendDebts) {
    const owed = roundMoney(debt.byCard[cardId] || 0);
    const inHand = roundMoney(inHandByHolder.get(debt.holderId) || 0);
    const usage = roundMoney(grossUsageByHolder.get(debt.holderId) || 0);
    toCollect = roundMoney(toCollect + owed);

    // A friend with nothing owed and nothing collected has no row to show.
    if (owed > 0 || inHand > 0) {
      friendBreakdown.push({
        holderId: debt.holderId,
        holderName: debt.holderName,
        owed,
        collectedInHand: inHand,
        usage,
      });
      collectedInHand = roundMoney(collectedInHand + inHand);
    }
  }

  const activeAssignment = input.assignments.find((a) => a.card_id === cardId && !a.returned_date);
  const currentHolderId =
    activeAssignment?.holder_id ?? holders.find((h) => h.relationship === 'me')?.id ?? null;

  return {
    cardId,
    toCollect,
    collectedInHand,
    friendBreakdown,
    cycles: buildCycleGroups(billingCycleDay, cardTxns, today),
    currentHolderId,
    collectedByTransaction,
  };
}

export interface HolderCardBreakdown {
  cardId: string;
  /** Still collectable on this card. */
  unpaidAmount: number;
  /** Gross usage of this card by this holder, paid or not. */
  grossAmount: number;
}

export interface HolderDetail {
  holderId: string;
  holderName: string;
  phone: string;
  relationship: string;
  /** Gross spend less refunds less card payments made on their behalf. */
  totalSpend: number;
  totalPaid: number;
  outstanding: number;
  byCard: HolderCardBreakdown[];
}

export interface HolderDetailInput {
  holders: DebtHolder[];
  transactions: DebtTransaction[];
  payments: DebtPayment[];
  cardPayments: DebtCardPayment[];
}

/**
 * One row per friend for the holders screen. Non-friends are excluded, matching the debt
 * engine — "me" rows have no outstanding balance by definition.
 */
export function computeHolderDetails(input: HolderDetailInput): HolderDetail[] {
  const debts = computeFriendDebts(input);
  const byId = new Map(input.holders.map((h) => [h.id, h]));

  const grossByHolderCard = new Map<string, Map<string, number>>();
  for (const t of input.transactions) {
    if (t.type !== 'spend' && t.type !== 'refund') continue;
    const delta = t.type === 'refund' ? -money(t.amount) : money(t.amount);
    let inner = grossByHolderCard.get(t.holder_id_at_time);
    if (!inner) {
      inner = new Map();
      grossByHolderCard.set(t.holder_id_at_time, inner);
    }
    inner.set(t.card_id, (inner.get(t.card_id) || 0) + delta);
  }

  return debts.friendDebts.map((debt) => {
    const gross = grossByHolderCard.get(debt.holderId) ?? new Map<string, number>();
    const cardIds = new Set([...Object.keys(debt.rawByCard), ...gross.keys()]);

    const byCard: HolderCardBreakdown[] = [...cardIds]
      .map((cardId) => ({
        cardId,
        unpaidAmount: roundMoney(debt.byCard[cardId] || 0),
        grossAmount: roundMoney(gross.get(cardId) || 0),
      }))
      .filter((b) => b.unpaidAmount !== 0 || b.grossAmount !== 0)
      .sort((a, b) => b.grossAmount - a.grossAmount);

    return {
      holderId: debt.holderId,
      holderName: debt.holderName,
      phone: debt.phone,
      relationship: byId.get(debt.holderId)?.relationship ?? 'friend',
      totalSpend: roundMoney(debt.totalSpend),
      totalPaid: roundMoney(debt.totalPaid),
      outstanding: roundMoney(debt.remainingToPay),
      byCard,
    };
  });
}
