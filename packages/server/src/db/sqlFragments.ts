import { sql } from 'drizzle-orm';

/**
 * A card's current balance with its bank: unpaid spend, less unpaid credits on the card, less
 * cash already forwarded to that bank as card payments.
 *
 * Card payments are only subtracted if they're linked to unpaid transactions or unlinked entirely.
 * Subtracting payments linked to paid transactions would double-count: the transaction is already
 * excluded from the unpaid spend sum, so subtracting its payment again makes the balance negative.
 *
 * Written as literal SQL text rather than with interpolated schema columns. Drizzle renders an
 * interpolated column *unqualified*, so `${transactions.card_id} = ${cards.id}` came out as
 * `"card_id" = "id"` — and inside the subquery both names resolve to `transactions`, which has
 * an `id` of its own. Every card therefore correlated against its own transaction ids, matched
 * nothing, and reported a balance of zero. That is what emptied the utilization rings.
 *
 * The inner tables are aliased so `cards.id` can only mean the outer query's card. Requires the
 * enclosing query to select FROM `cards` without aliasing it.
 */
export const currentSpendSql = sql<string>`(
  COALESCE((SELECT SUM(t.amount) FROM transactions t
    WHERE t.card_id = cards.id AND t.is_paid = FALSE AND t.type = 'spend'), 0)
  - COALESCE((SELECT SUM(t.amount) FROM transactions t
    WHERE t.card_id = cards.id AND t.is_paid = FALSE AND t.type IN ('bill_payment', 'refund')), 0)
  - COALESCE((SELECT SUM(cp.amount) FROM card_payments cp
    WHERE cp.card_id = cards.id
      AND (cp.transaction_id IS NULL OR EXISTS (
        SELECT 1 FROM transactions t2
        WHERE t2.id = cp.transaction_id AND t2.is_paid = FALSE
      ))
  ), 0)
)::text`;
