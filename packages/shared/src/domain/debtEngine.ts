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
 * Gross Spend     all `spend` rows less `refund` rows, whatever their is_paid flag
 * Cash Payment    a `payments` row: money a friend actually handed over / transferred
 * Card Payment    a `card_payments` row: you forwarding collected cash to a bank
 * Settled Spend   a transaction flagged is_paid — its bill has been paid to the bank
 * To Collect      per card: unsettled spend, less cash and card payments against it
 * Outstanding     per friend: gross spend less every rupee of cash received
 * Advance In Hand cash received that has not yet gone out as a settled bill; negative when
 *                 bills were paid before the cash came in, i.e. out of my own pocket
 *
 * ── Two different questions, two different answers ────────────────────────────
 * "What does this friend owe me?" is friend-level: gross spend less every rupee they have
 * handed over, including lump sums that name no card. That is `remainingToPay`, and `is_paid`
 * has no say in it — a bill you paid out of your own pocket does not make their money appear.
 *
 * "What must I still collect for this card?" is card-level, and in this ledger settling a
 * bill is how a transaction is recorded as done with: the cash came in, the bill went out,
 * the row gets flagged is_paid. So per card only *unsettled* spend counts, less cash linked
 * to it and less card payments made against it.
 *
 * The two therefore do not have to agree, and where a friend pays in unlinked lump sums they
 * will not — the per-card figures can sum higher than the friend-level one. See `byCard`.
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
  /** The row's own id. Needed so a card payment can be listed and edited, not for the math. */
  id?: string;
  card_id: string;
  holder_id: string;
  /** Present in the table but not used here: the card is what a card payment settles. */
  transaction_id?: string | null;
  amount: number | string;
  /** ISO date. Debt is date-independent; this only places the row in a billing cycle. */
  payment_date?: string;
}

export interface FriendDebt {
  holderId: string;
  holderName: string;
  phone: string;
  /** Gross spend less refunds, across every card. Not reduced by card payments or is_paid. */
  totalSpend: number;
  /** Cash payments received from this friend, linked or not. */
  totalPaid: number;
  /** totalSpend less totalPaid, floored at zero. Counts unlinked cash too. */
  remainingToPay: number;
  /**
   * Per-card amount still to collect: spend not yet flagged is_paid, less cash linked to
   * those unsettled transactions, less card payments made for this friend on that card.
   *
   * Two things are deliberately absent. Settled spend, because flagging a bill paid is how
   * this ledger marks a transaction finished with. And unlinked cash, because a lump-sum
   * transfer names no card. Summing `byCard` therefore does NOT reproduce `remainingToPay`
   * — expect it to come out higher wherever lump sums are involved.
   */
  byCard: Record<string, number>;
  /** Per-card gross spend, settled or not, before any cash is applied. */
  rawByCard: Record<string, number>;
  /**
   * Per-card spend not yet flagged is_paid, before any cash or card payment is applied.
   *
   * This is what the card tiles show as "usage": it is `byCard` plus whatever has been settled
   * against the card, so the pair reads as "of this much still on the card, this much is left to
   * collect". `rawByCard` would put lifetime spend next to a live to-collect figure instead.
   */
  unpaidByCard: Record<string, number>;
}

export interface FriendDebtResult {
  friendDebts: FriendDebt[];
  toCollectByCard: Record<string, number>;
  totalToCollect: number;
  friendTotalSpend: number;
  friendTotalPaid: number;
  friendRemainingToPay: number;
  /**
   * Collected cash still sitting with me. Signed: negative means I paid bills ahead of the cash
   * arriving and am that much out of pocket.
   */
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
 * Ordering note: the refund-credit clawback below reads `toCollectByCard`, which is
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
  let friendTotalSettled = 0; // spend whose bill has been paid to a bank
  let friendTotalForwarded = 0; // collected cash sent on to a bank as a card payment

  const toCollectByCard: Record<string, number> = {};
  const friendDebts: FriendDebt[] = [];

  // Aggregate unsettled spend by card across all friends. Needed to correctly meter card
  // payments made from your own pocket: a self-funded payment can only reduce Advance In Hand
  // as far as there is unsettled spend for it to pay off, and that spend might belong to any
  // friend.
  const globalUnsettledByCard: Record<string, number> = {};
  for (const txn of transactions) {
    if ((txn.type === 'spend' || txn.type === 'refund') && !txn.is_paid) {
      const delta = txn.type === 'refund' ? -money(txn.amount) : money(txn.amount);
      globalUnsettledByCard[txn.card_id] = roundMoney(
        (globalUnsettledByCard[txn.card_id] || 0) + delta,
      );
    }
  }

  for (const friend of friends) {
    const friendTxns = txnsByHolder.get(friend.id) ?? [];
    const friendPayments = paymentsByHolder.get(friend.id) ?? [];
    const friendCardPayments = cardPaymentsByHolder.get(friend.id) ?? [];

    const rawByCard: Record<string, number> = {};
    const unsettledByCard: Record<string, number> = {};
    let expenses = 0;
    let settled = 0;

    for (const txn of friendTxns) {
      if (txn.type !== 'spend' && txn.type !== 'refund') continue;
      const delta = txn.type === 'refund' ? -money(txn.amount) : money(txn.amount);
      expenses += delta;
      rawByCard[txn.card_id] = roundMoney((rawByCard[txn.card_id] || 0) + delta);
      if (txn.is_paid) {
        settled += delta;
      } else {
        unsettledByCard[txn.card_id] = roundMoney((unsettledByCard[txn.card_id] || 0) + delta);
      }
    }

    // Cash received from this friend. Unlinked cash reduces their overall balance but is not
    // attributable to any one card, so it does not touch settlementByCard.
    const paid = friendPayments.reduce((sum, p) => sum + money(p.amount), 0);

    // Cash and card payments that both settle a specific card. Cash linked to an already
    // settled transaction is skipped: that spend is out of `unsettledByCard` already, so
    // subtracting its cash a second time would understate what is left to collect.
    const settlementByCard: Record<string, number> = {};
    for (const p of friendPayments) {
      if (!p.transaction_id) continue;
      const txn = txnById.get(p.transaction_id);
      if (txn && !txn.is_paid) {
        settlementByCard[txn.card_id] = (settlementByCard[txn.card_id] || 0) + money(p.amount);
      }
    }
    const cardPaymentByCard: Record<string, number> = {};
    for (const cp of friendCardPayments) {
      settlementByCard[cp.card_id] = (settlementByCard[cp.card_id] || 0) + money(cp.amount);
      cardPaymentByCard[cp.card_id] = (cardPaymentByCard[cp.card_id] || 0) + money(cp.amount);
    }

    // Card payments only count as cash leaving the hand where there is still-unsettled spend for
    // them to pay off. Beyond that the bill has already been flagged is_paid, and `settled` above
    // has counted the same outflow — subtracting both would report the cash gone twice over. Once
    // a transaction is later flagged is_paid its card payment drops out of this sum on its own,
    // so the figure never double-counts and never needs a reconciliation pass.
    for (const cId of Object.keys(cardPaymentByCard)) {
      const unsettled = Math.max(0, unsettledByCard[cId] || 0);
      const counted = Math.min(unsettled, cardPaymentByCard[cId]);
      friendTotalForwarded += counted;
      // Drain the global pool: this friend's card payment has consumed some of the card's
      // unsettled spend, leaving less for non-friend payments to settle.
      globalUnsettledByCard[cId] = Math.max(
        0,
        roundMoney((globalUnsettledByCard[cId] || 0) - counted),
      );
    }

    friendTotalSpend += expenses;
    friendTotalPaid += paid;
    friendTotalSettled += settled;
    const remainingToPay = Math.max(0, roundMoney(expenses - paid));

    const byCard: Record<string, number> = {};
    const unpaidByCard: Record<string, number> = {};
    for (const cId of Object.keys(rawByCard)) {
      const unsettled = unsettledByCard[cId] || 0;
      unpaidByCard[cId] = Math.max(0, roundMoney(unsettled));
      if (unsettled <= 0) {
        byCard[cId] = 0;
        // Refunds outrunning unsettled spend is real credit on the card; drop it on the floor
        // and the card's total stays too high forever.
        if (unsettled < 0 && toCollectByCard[cId]) {
          toCollectByCard[cId] = Math.max(0, roundMoney(toCollectByCard[cId] + unsettled));
        }
        continue;
      }
      // Settlement only ever pays a balance down to zero. Unlike a refund it cannot leave the
      // friend in credit, so any excess stops here instead of being clawed off whoever else
      // owes money on this card.
      byCard[cId] = Math.max(0, roundMoney(unsettled - (settlementByCard[cId] || 0)));
      if (byCard[cId] > 0) {
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
      unpaidByCard,
    });
  }

  friendDebts.sort((a, b) => b.remainingToPay - a.remainingToPay);

  // Self-funded card payments: when you pay from your own pocket (holder_id with
  // relationship='me' or other non-friends), those were not counted in the friend loop above.
  // Count them now against whatever unsettled spend remains after friend card payments.
  const nonFriendHolders = holders.filter((h) => h.relationship !== 'friend');
  for (const holder of nonFriendHolders) {
    const holderCardPayments = cardPaymentsByHolder.get(holder.id) ?? [];
    for (const cp of holderCardPayments) {
      const unsettled = Math.max(0, globalUnsettledByCard[cp.card_id] || 0);
      const counted = Math.min(unsettled, money(cp.amount));
      friendTotalForwarded += counted;
      // Drain as we count: if multiple non-friends paid the same card, the second payment
      // can only reduce the advance by whatever unsettled spend is left.
      globalUnsettledByCard[cp.card_id] = Math.max(0, roundMoney(unsettled - counted));
    }
  }

  const totalToCollect = roundMoney(Object.values(toCollectByCard).reduce((a, b) => a + b, 0));
  const friendRemainingToPay = Math.max(0, roundMoney(friendTotalSpend - friendTotalPaid));

  // "Collected (Not Settled)" / "Advance In Hand": cash friends have handed over that has not
  // yet left again. Two things take it out of hand.
  //
  // Settled spend, because flagging a bill is_paid is how this ledger records that its money
  // went to the bank. `card_payments` rows exist for only a fraction of the bills ever paid, so
  // metering the outflow by them alone would report lakhs still in hand that left months ago.
  //
  // And card payments against spend that is *not* yet settled, which is the case the is_paid
  // flag cannot see: recording one means you have already forwarded that cash to the bank on the
  // friend's behalf. It is deliberately the only figure a card payment moves besides the card's
  // own to-collect — friend-level Outstanding and the dashboard's To Collect stay put, because a
  // card payment is not the friend paying you.
  //
  // Signed, not floored. Going negative is the meaningful case: paying a bill before collecting
  // for it means more has left than came in, and that money came out of my own pocket. Clamping
  // it at zero reported "nothing in hand" for both being square and being out of pocket, which
  // are the two states this figure exists to tell apart.
  const friendAdvanceInHand = roundMoney(
    friendTotalPaid - friendTotalSettled - friendTotalForwarded,
  );

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
