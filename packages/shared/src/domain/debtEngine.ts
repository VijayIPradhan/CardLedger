/**
 * The authoritative friend-debt engine.
 *
 * Every "who owes what" figure in the product comes from here. Before this module the same
 * math existed in seven places — the summary route, two Android ViewModels, three web
 * screens, and `getFriendCollectionTotal` in analytics.ts — and they disagreed: the web
 * variants ignored `is_paid` and the `card_payments` table entirely, so they reported debt
 * that had already been settled. Clients now render these results and compute nothing.
 *
 * Deliberately pure and dependency-free: no db handles, no Date.now(), no ORM row shapes.
 * `today` is always passed in. That is what makes the rules below testable, and they are
 * the rules that were previously only encoded in comments.
 *
 * ── Vocabulary ────────────────────────────────────────────────────────────────
 * Gross Spend     all `spend` rows less `refund` rows, regardless of is_paid
 * Unpaid Spend    the subset with is_paid = false — the only thing that can be "to collect"
 * Cash Payment    a `payments` row: physical cash a friend handed over
 * Card Payment    a `card_payments` row: money paid straight to the bank for a friend
 * To Collect      unpaid spend less linked cash and card payments, floored at zero
 * Advance In Hand cash received that has not yet been used to settle a txn or pay a bank
 */

export interface DebtHolder {
  id: string;
  name: string;
  phone?: string | null;
  relationship: string;
}

export interface DebtTransaction {
  id: string;
  card_id: string;
  holder_id_at_time: string;
  amount: number | string;
  type: string;
  is_paid: boolean;
  txn_date: string;
}

export interface DebtPayment {
  holder_id: string;
  transaction_id?: string | null;
  amount: number | string;
}

export interface DebtCardPayment {
  card_id: string;
  holder_id: string;
  transaction_id?: string | null;
  amount: number | string;
}

export interface FriendDebt {
  holderId: string;
  holderName: string;
  phone: string;
  /** Gross spend less refunds less card payments made on this friend's behalf. */
  totalSpend: number;
  /** Cash payments received from this friend. */
  totalPaid: number;
  remainingToPay: number;
  /** Per-card debt after applying linked cash and card payments, floored at zero. */
  byCard: Record<string, number>;
  /** Per-card UNPAID spend before any payment is applied. The gross figure. */
  rawByCard: Record<string, number>;
}

export interface FriendDebtResult {
  friendDebts: FriendDebt[];
  toCollectByCard: Record<string, number>;
  totalToCollect: number;
  friendTotalSpend: number;
  friendTotalPaid: number;
  friendRemainingToPay: number;
  friendAdvanceInHand: number;
}

export interface FriendDebtInput {
  holders: DebtHolder[];
  transactions: DebtTransaction[];
  payments: DebtPayment[];
  cardPayments: DebtCardPayment[];
}

export function money(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes per-friend and per-card debt.
 *
 * Ordering note: the negative-overshoot clawback below reads `toCollectByCard`, which is
 * accumulated across friends as the loop runs. A friend whose refunds exceed their spend on
 * a card can therefore only claw back debt from friends processed BEFORE them. That is the
 * behaviour the app has always had and the clients are consistent with it, so it is
 * preserved here rather than silently changed.
 */
export function computeFriendDebts(input: FriendDebtInput): FriendDebtResult {
  const { holders, transactions, payments, cardPayments } = input;

  // Indexed up front: the friend loop would otherwise rescan every transaction per friend,
  // and each linked payment would cost another full scan.
  const txnById = new Map(transactions.map((t) => [t.id, t]));
  const txnsByHolder = groupBy(transactions, (t) => t.holder_id_at_time);
  const paymentsByHolder = groupBy(payments, (p) => p.holder_id);
  const cardPaymentsByHolder = groupBy(cardPayments, (p) => p.holder_id);

  const friends = holders.filter((h) => h.relationship === 'friend');

  let friendTotalSpend = 0; // gross spend less card payments, across all friends
  let friendTotalPaid = 0; // cash received, across all friends
  let friendTotalCardPayments = 0; // paid straight to banks on friends' behalf
  let friendTotalGrossSpend = 0; // needed to derive paid-spend for the advance calc
  let friendTotalUnpaidSpend = 0;

  const toCollectByCard: Record<string, number> = {};
  const friendDebts: FriendDebt[] = [];

  for (const friend of friends) {
    const friendTxns = txnsByHolder.get(friend.id) ?? [];
    const friendPayments = paymentsByHolder.get(friend.id) ?? [];
    const friendCardPayments = cardPaymentsByHolder.get(friend.id) ?? [];

    const rawByCard: Record<string, number> = {};
    let expenses = 0;

    for (const txn of friendTxns) {
      const amt = money(txn.amount);
      const cId = txn.card_id;
      if (txn.type === 'refund') {
        expenses -= amt;
        friendTotalGrossSpend -= amt;
        if (!txn.is_paid && amt > 0) {
          rawByCard[cId] = roundMoney((rawByCard[cId] || 0) - amt);
          friendTotalUnpaidSpend -= amt;
        }
      } else if (txn.type === 'spend') {
        expenses += amt;
        friendTotalGrossSpend += amt;
        if (!txn.is_paid && amt > 0) {
          rawByCard[cId] = roundMoney((rawByCard[cId] || 0) + amt);
          friendTotalUnpaidSpend += amt;
        }
      }
    }

    // Cash received from this friend. Unlinked cash reduces their overall balance but is not
    // attributable to any one card, so it does not touch paymentsByCard.
    const paid = friendPayments.reduce((sum, p) => sum + money(p.amount), 0);

    const paymentsByCard: Record<string, number> = {};
    for (const p of friendPayments) {
      if (!p.transaction_id) continue;
      const txn = txnById.get(p.transaction_id);
      // Only count it if the linked txn is still unpaid. A paid txn was never added to
      // rawByCard, so subtracting its payment here would double-dip and wipe out unrelated
      // debt on the same card.
      if (txn && !txn.is_paid) {
        paymentsByCard[txn.card_id] = (paymentsByCard[txn.card_id] || 0) + money(p.amount);
      }
    }

    const cardPaymentsByCard: Record<string, number> = {};
    for (const cp of friendCardPayments) {
      const amt = money(cp.amount);
      // Always reduces the friend's overall balance: the money did reach the bank.
      expenses -= amt;
      friendTotalCardPayments += amt;

      if (cp.transaction_id) {
        const txn = txnById.get(cp.transaction_id);
        // Same double-dip guard as cash above.
        if (txn && !txn.is_paid) {
          cardPaymentsByCard[cp.card_id] = (cardPaymentsByCard[cp.card_id] || 0) + amt;
        }
      } else {
        // Unlinked card payments apply to the card they were made against.
        cardPaymentsByCard[cp.card_id] = (cardPaymentsByCard[cp.card_id] || 0) + amt;
      }
    }

    friendTotalSpend += expenses;
    friendTotalPaid += paid;
    const remainingToPay = Math.max(0, expenses - paid);

    const byCard: Record<string, number> = {};
    for (const [cId, amt] of Object.entries(rawByCard)) {
      const adjustedAmt = amt - (cardPaymentsByCard[cId] || 0) - (paymentsByCard[cId] || 0);
      if (adjustedAmt <= 0) {
        byCard[cId] = 0;
        // Overshoot (refunds or payments exceeding this friend's spend on the card) is real
        // credit; drop it on the floor and the card's total stays too high forever.
        if (adjustedAmt < 0 && toCollectByCard[cId]) {
          toCollectByCard[cId] = Math.max(0, roundMoney(toCollectByCard[cId] + adjustedAmt));
        }
      } else {
        byCard[cId] = roundMoney(adjustedAmt);
        toCollectByCard[cId] = roundMoney((toCollectByCard[cId] || 0) + byCard[cId]);
      }
    }

    friendDebts.push({
      holderId: friend.id,
      holderName: friend.name,
      phone: friend.phone ?? '',
      totalSpend: expenses,
      totalPaid: paid,
      remainingToPay,
      byCard,
      rawByCard,
    });
  }

  friendDebts.sort((a, b) => b.remainingToPay - a.remainingToPay);

  const totalToCollect = Object.values(toCollectByCard).reduce((a, b) => a + b, 0);
  const friendRemainingToPay = Math.max(0, friendTotalSpend - friendTotalPaid);

  // Cash we are holding that has not been spent yet. Transactions marked paid consumed some
  // of it, and card payments consumed some of it; whatever is left is an advance.
  const paidSpend = friendTotalGrossSpend - friendTotalUnpaidSpend;
  const friendAdvanceInHand = Math.max(0, friendTotalPaid - paidSpend - friendTotalCardPayments);

  return {
    friendDebts,
    toCollectByCard,
    totalToCollect,
    friendTotalSpend,
    friendTotalPaid,
    friendRemainingToPay,
    friendAdvanceInHand,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
