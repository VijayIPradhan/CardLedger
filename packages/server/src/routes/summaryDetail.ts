import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  cards,
  holders,
  assignments,
  transactions,
  payments,
  card_payments,
} from '../db/schema.js';
import { eq, desc, getTableColumns } from 'drizzle-orm';
import { computeCardDetail, computeHolderDetails } from '@cardledger/shared';

/**
 * Detail views for a single card and for the friends list.
 *
 * These exist so the clients can stop deriving money. Both Android and web previously
 * recomputed cycles, per-friend balances and "to collect" locally — and disagreed with each
 * other and with /summary. Everything here comes out of the shared engine instead.
 *
 * Registered under the same /dashboard prefix as summaryRoutes; kept in its own file because
 * summary.ts is already long enough.
 */
export async function summaryDetailRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  /**
   * Loads every row the debt engine needs for a user. The engine deliberately requires the
   * full picture: cash and card payments can be linked to transactions on any card, so
   * narrowing the query to one card would produce wrong per-card debt.
   */
  async function loadLedger(userId: string) {
    const [userHolders, userTxns, userPayments, userCardPayments, userAssignments] =
      await Promise.all([
        db.select().from(holders).where(eq(holders.user_id, userId)),
        db
          .select({ ...getTableColumns(transactions) })
          .from(transactions)
          .innerJoin(cards, eq(transactions.card_id, cards.id))
          .where(eq(cards.user_id, userId))
          .orderBy(desc(transactions.txn_date)),
        db
          .select({ ...getTableColumns(payments) })
          .from(payments)
          .innerJoin(holders, eq(payments.holder_id, holders.id))
          .where(eq(holders.user_id, userId)),
        db
          .select({ ...getTableColumns(card_payments) })
          .from(card_payments)
          .innerJoin(holders, eq(card_payments.holder_id, holders.id))
          .where(eq(holders.user_id, userId)),
        db
          .select({ ...getTableColumns(assignments) })
          .from(assignments)
          .innerJoin(cards, eq(assignments.card_id, cards.id))
          .where(eq(cards.user_id, userId)),
      ]);

    return {
      holders: userHolders,
      transactions: userTxns.map((t) => ({ ...t, txn_date: isoDate(t.txn_date) })),
      payments: userPayments,
      // The date matters only for placing a card payment in a billing cycle on the card screen,
      // but it has to arrive as an ISO string like every other date the engine sees.
      cardPayments: userCardPayments.map((p) => ({ ...p, payment_date: isoDate(p.payment_date) })),
      assignments: userAssignments,
    };
  }

  app.get<{ Params: { cardId: string } }>('/card/:cardId', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { cardId } = req.params;

    const card = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    // Ownership check before anything else — the cardId comes straight from the URL.
    if (card.length === 0 || card[0].user_id !== userId) {
      return reply.code(404).send({ error: 'Card not found' });
    }

    const ledger = await loadLedger(userId);

    const detail = computeCardDetail({
      cardId,
      billingCycleDay: card[0].billing_cycle_day,
      holders: ledger.holders,
      transactions: ledger.transactions,
      payments: ledger.payments,
      cardPayments: ledger.cardPayments,
      assignments: ledger.assignments,
      today: today(),
    });

    // Group-aware spend: cards sharing a limit report the group's usage, matching the way the
    // cards list and the utilisation ring already present a shared limit.
    const groupId = card[0].shared_limit_with || cardId;
    const groupCardIds = new Set(
      (await db.select().from(cards).where(eq(cards.user_id, userId)))
        .filter((c) => c.id === groupId || c.shared_limit_with === groupId)
        .map((c) => c.id),
    );
    if (groupCardIds.size === 0) groupCardIds.add(cardId);

    const spend = (cardIds: Set<string>, unpaidOnly: boolean) =>
      round(
        ledger.transactions.reduce((sum, t) => {
          if (!cardIds.has(t.card_id)) return sum;
          if (unpaidOnly && t.is_paid) return sum;
          const amt = Number(t.amount) || 0;
          if (t.type === 'spend') return sum + amt;
          if (t.type === 'refund' || t.type === 'bill_payment') return sum - amt;
          return sum;
        }, 0),
      );

    const groupCardPayments = round(
      ledger.cardPayments.reduce(
        (sum, p) => (groupCardIds.has(p.card_id) ? sum + (Number(p.amount) || 0) : sum),
        0,
      ),
    );

    return {
      ...detail,
      /** Gross spend across the shared-limit group, paid or not. */
      totalSpend: spend(groupCardIds, false),
      /** What the group currently owes the bank: unpaid spend less payments made to it. */
      currentSpend: round(spend(groupCardIds, true) - groupCardPayments),
      sharedLimitGroup: [...groupCardIds],
    };
  });

  app.get('/holders', auth, async (req) => {
    const ledger = await loadLedger(req.user.sub);
    return computeHolderDetails({
      holders: ledger.holders,
      transactions: ledger.transactions,
      payments: ledger.payments,
      cardPayments: ledger.cardPayments,
    });
  });
}

/** Drizzle hands back `date` columns as strings or Dates depending on the driver. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value ?? '').split('T')[0];
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
