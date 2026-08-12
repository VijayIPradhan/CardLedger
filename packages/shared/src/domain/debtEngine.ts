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
 * Gross Spend     all `spend` rows less `refund` rows
 * Cash Payment    a `payments` row: money a friend actually handed over / transferred
 * Card Payment    a `card_payments` row: you forwarding collected cash to the bank
 * To Collect      gross spend less cash payments, floored at zero
 * Advance In Hand cash received from friends that has not been forwarded to a bank yet
 *
 * ── Why card payments and is_paid do NOT reduce debt ──────────────────────────
 * Friends never pay the bank. They transfer money to you (a `payments` row) and you pay the
 * bill yourself (a `card_payments` row). So a card payment is you *spending cash you already
 * collected* — the `payments` row already cleared the debt, and subtracting the card payment
 * as well double-counted it. Worse, the resulting negative balance was clawed back off other
 * friends' debt on the same card via the overshoot rule below.
 *
 * `is_paid` means "this transaction's bill has been paid to the bank". It says nothing about
 * whether the friend settled with you, so it must not remove their debt either. Marking a
 * friend's spend as paid used to erase what they owed with no `payments` row in sight.
 *
 * Both therefore feed only the bank-facing figures (a card's balance, Advance In Hand) and
 * never the friend-facing ones.
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
  /** Present in the table but not used here — a card payment never targets friend debt. */
  transaction_id?: string | null;
  amount: number | string;
}

export interface FriendDebt {
  holderId: string;
  holderName: string;
  phone: string;
  /** Gross spend less refunds. Not reduced by card payments or by is_paid. */
  totalSpend: number;
  /** Cash payments received from this friend, linked or not. */
  totalPaid: number;
  /** totalSpend less totalPaid, floored at zero. Counts unlinked cash too. */
  remainingToPay: number;
  /**
   * Per-card debt after applying cash linked to a transaction on that card, floored at zero.
   *
   * Unlinked cash is deliberately absent: a lump-sum transfer is not attributable to a card,
   * so it lowers `remainingToPay` only. Summing `byCard` therefore does NOT reproduce
   * `remainingToPay` when a friend has paid unlinked cash — that is by design.
   */
  byCard: Record<string, number>;
  /** Per-card gross spend before any cash is applied. */
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

  let friendTotalSpend = 0; // gross spend less refunds, across all friends
  let friendTotalPaid = 0; // cash received, across all friends
  let friendTotalCardPayments = 0; // collected cash forwarded to banks

  const toCollectByCard: Record<string, number> = {};
  const friendDebts: FriendDebt[] = [];

  for (const friend of friends) {
    const friendTxns = txnsByHolder.get(friend.id) ?? [];
    const friendPayments = paymentsByHolder.get(friend.id) ?? [];
    const friendCardPayments = cardPaymentsByHolder.get(friend.id) ?? [];

    const rawByCard: Record<string, number> = {};
    let expenses = 0;

    for (const txn of friendTxns) {
      if (txn.type !== 'spend' && txn.type !== 'refund') continue;
      // is_paid is not consulted: it records that the bank was paid, not that the friend
      // settled with you.
      const delta = txn.type === 'refund' ? -money(txn.amount) : money(txn.amount);
      expenses += delta;
      rawByCard[txn.card_id] = roundMoney((rawByCard[txn.card_id] || 0) + delta);
    }

    // Cash received from this friend. Unlinked cash reduces their overall balance but is not
    // attributable to any one card, so it does not touch paymentsByCard.
    const paid = friendPayments.reduce((sum, p) => sum + money(p.amount), 0);

    const paymentsByCard: Record<string, number> = {};
    for (const p of friendPayments) {
      if (!p.transaction_id) continue;
      const txn = txnById.get(p.transaction_id);
      if (txn) {
        paymentsByCard[txn.card_id] = (paymentsByCard[txn.card_id] || 0) + money(p.amount);
      }
    }

    // Tracked for Advance In Hand only — see the header note on why this cannot touch debt.
    friendTotalCardPayments += friendCardPayments.reduce((sum, cp) => sum + money(cp.amount), 0);

    friendTotalSpend += expenses;
    friendTotalPaid += paid;
    const remainingToPay = Math.max(0, roundMoney(expenses - paid));

    const byCard: Record<string, number> = {};
    for (const [cId, amt] of Object.entries(rawByCard)) {
      const adjustedAmt = amt - (paymentsByCard[cId] || 0);
      if (adjustedAmt <= 0) {
        byCard[cId] = 0;
        // Overshoot (refunds or cash exceeding this friend's spend on the card) is real
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
      totalSpend: roundMoney(expenses),
      totalPaid: roundMoney(paid),
      remainingToPay,
      byCard,
      rawByCard,
    });
  }

  friendDebts.sort((a, b) => b.remainingToPay - a.remainingToPay);

  const totalToCollect = roundMoney(Object.values(toCollectByCard).reduce((a, b) => a + b, 0));
  const friendRemainingToPay = Math.max(0, roundMoney(friendTotalSpend - friendTotalPaid));

  // "Collected (Not Settled)": cash friends have transferred to you that you have not yet
  // forwarded to a bank. Only card payments consume it — marking a transaction is_paid records
  // that the bank was paid, which says nothing about where the money came from.
  const friendAdvanceInHand = Math.max(0, roundMoney(friendTotalPaid - friendTotalCardPayments));

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
