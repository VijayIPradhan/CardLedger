import { sql, inArray, type SQL } from 'drizzle-orm';
import type { CardPaymentAllocation } from '@cardledger/shared';
import { db } from './index.js';
import { card_payment_allocations } from './schema.js';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The pool, or a transaction: reads inside a transaction must go through it. */
type Executor = typeof db | Tx;

/**
 * card_payment_allocations is the source of truth for how a card payment is applied to spend
 * (phase 2, docs/design/bill-payment-allocations.md). A card_payments row is one real payment;
 * its allocations carry no money of their own, and whatever is not allocated is simply the
 * payment's amount less its allocations.
 *
 * transactions.payments_received / is_paid are a cache of the allocations, refreshed by
 * recomputeSettlement in the same DB transaction as every allocation write.
 */

const uuidList = (ids: string[]): SQL =>
  sql`(${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;

/** Allocations of the given payments, keyed by payment id. Payments without any map to []. */
export async function loadAllocations(
  paymentIds: string[],
  executor: Executor = db,
): Promise<Map<string, CardPaymentAllocation[]>> {
  const out = new Map<string, CardPaymentAllocation[]>(paymentIds.map((id) => [id, []]));
  if (paymentIds.length === 0) return out;
  const rows = await executor
    .select()
    .from(card_payment_allocations)
    .where(inArray(card_payment_allocations.card_payment_id, paymentIds));
  for (const r of rows) {
    out.get(r.card_payment_id)?.push({ transaction_id: r.transaction_id, amount: r.amount });
  }
  return out;
}

/** Attaches `allocations` to card payment rows, for the shared engine and API responses. */
export async function withAllocations<T extends { id: string }>(
  rows: T[],
  executor: Executor = db,
): Promise<Array<T & { allocations: CardPaymentAllocation[] }>> {
  const byPayment = await loadAllocations(
    rows.map((r) => r.id),
    executor,
  );
  return rows.map((r) => ({ ...r, allocations: byPayment.get(r.id) ?? [] }));
}

/** Transactions a payment is currently allocated to. Read before changing or deleting it. */
export async function allocatedTransactionIds(tx: Tx, paymentId: string): Promise<string[]> {
  const res = await tx.execute(sql`
    SELECT transaction_id FROM card_payment_allocations WHERE card_payment_id = ${paymentId}`);
  return (res.rows as Array<{ transaction_id: string }>).map((r) => r.transaction_id);
}

/** Adds `amount` to the payment's allocation on `transactionId`, creating it if needed. */
export async function addAllocation(
  tx: Tx,
  paymentId: string,
  transactionId: string,
  amount: number,
) {
  await tx.execute(sql`
    INSERT INTO card_payment_allocations (card_payment_id, transaction_id, amount)
    VALUES (${paymentId}, ${transactionId}, ${String(amount)})
    ON CONFLICT (card_payment_id, transaction_id)
    DO UPDATE SET amount = card_payment_allocations.amount + EXCLUDED.amount`);
}

/** Replaces the payment's allocations with `allocations` (empty clears them). */
export async function replaceAllocations(
  tx: Tx,
  paymentId: string,
  allocations: Array<{ transaction_id: string; amount: number }>,
) {
  await tx.execute(sql`DELETE FROM card_payment_allocations WHERE card_payment_id = ${paymentId}`);
  for (const a of allocations) {
    if (a.amount > 0) await addAllocation(tx, paymentId, a.transaction_id, a.amount);
  }
}

/**
 * Refreshes payments_received and is_paid on the given transactions from their allocations.
 *
 * is_paid becomes true once allocations cover the amount. It is cleared only if it had been set
 * by allocations (payments_received covered the amount before): a transaction marked paid by
 * hand stays paid when a payment against it is edited or removed.
 *
 * In an UPDATE every SET expression reads the row's old values, which is what the is_paid rule
 * relies on.
 */
export async function recomputeSettlement(
  tx: Tx,
  transactionIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(transactionIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  await tx.execute(sql`
    UPDATE transactions t
    SET payments_received = s.total,
        is_paid = (s.total >= t.amount) OR (t.is_paid AND t.payments_received < t.amount)
    FROM (
      SELECT t2.id, COALESCE(SUM(a.amount), 0) AS total
      FROM transactions t2
      LEFT JOIN card_payment_allocations a ON a.transaction_id = t2.id
      WHERE t2.id IN ${uuidList(ids)}
      GROUP BY t2.id
    ) s
    WHERE t.id = s.id`);
}
