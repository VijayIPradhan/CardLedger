import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  distributePayment,
  type CardPaymentAllocation,
  type CreateCardPaymentInput,
  type UpdateCardPaymentInput,
} from '@cardledger/shared';
import { db } from '../db/index.js';
import { card_payments, cards, transactions } from '../db/schema.js';
import {
  allocatedTransactionIds,
  loadAllocations,
  recomputeSettlement,
  replaceAllocations,
  type Tx,
} from '../db/allocations.js';
import { ownsHolder, resolveCardHolder } from './holders.js';

/**
 * Card payments: one row per payment to a card's bank, applied to spend through
 * card_payment_allocations. Every write path (POST/PATCH/DELETE /card-payments and the older
 * bill_payment branch of /transactions) goes through here, so the rules live in one place:
 *
 * 1. a payment is allocated at most its own amount;
 * 2. a transaction is allocated at most what it costs;
 * 3. allocations only name spend on the payment's own card;
 * 4. settlement (payments_received / is_paid) is recomputed in the same DB transaction.
 *
 * The transactions a payment touches are locked FOR UPDATE before their remaining amounts are
 * read, so two payments made at once cannot both claim the same unpaid balance.
 */

export class CardPaymentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type CardPaymentRow = typeof card_payments.$inferSelect;
export type CardPaymentWithAllocations = CardPaymentRow & { allocations: CardPaymentAllocation[] };

type AllocationSpec =
  | { allocations: Array<{ transaction_id: string; amount: number }> }
  | { transaction_ids: string[] }
  | Record<string, never>;

const paise = (rupees: number | string) => Math.round(Number(rupees) * 100);

/** A card payment in the transaction shape the clients list (`type: 'bill_payment'`). */
export function billPaymentRow(p: CardPaymentWithAllocations) {
  const allocated = p.allocations.reduce((sum, a) => sum + paise(a.amount), 0);
  return {
    id: p.id,
    card_id: p.card_id,
    amount: p.amount,
    merchant: p.notes || 'Payment to Bank',
    txn_date: isoDay(p.payment_date),
    source: 'manual',
    type: 'bill_payment',
    category: null,
    tags: null,
    original_currency: null,
    original_amount: null,
    forex_markup_fee: null,
    reward_earned: null,
    reward_currency: null,
    is_paid: true, // bill payments don't have is_paid
    holder_id_at_time: p.holder_id, // map holder_id to holder_id_at_time
    // Older clients read a single link; only meaningful when there is exactly one.
    linked_transaction_id: p.allocations.length === 1 ? p.allocations[0].transaction_id : null,
    allocations: p.allocations,
    unallocated_amount: String(Math.max(0, paise(p.amount) - allocated) / 100),
    raw_sms_encrypted: null,
    dedupe_hash: null,
    created_at: p.created_at,
    bank_paid_amount: 0,
  };
}

/** The user's card payment, or null if it does not exist or is someone else's. */
export async function findCardPayment(
  userId: string,
  id: string,
): Promise<CardPaymentWithAllocations | null> {
  const [row] = await db
    .select({ payment: card_payments })
    .from(card_payments)
    .innerJoin(cards, eq(card_payments.card_id, cards.id))
    .where(and(eq(card_payments.id, id), eq(cards.user_id, userId)));
  if (!row) return null;
  const allocations = (await loadAllocations([id])).get(id) ?? [];
  return { ...row.payment, allocations };
}

export async function createCardPayment(
  userId: string,
  input: CreateCardPaymentInput,
): Promise<CardPaymentWithAllocations> {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, input.card_id), eq(cards.user_id, userId)));
  if (!card) throw new CardPaymentError('Card not found', 404);

  const holderId = await payerFor(
    userId,
    input.card_id,
    input.payment_date,
    input.funded_by_holder_id,
  );

  const id = await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(card_payments)
      .values({
        card_id: input.card_id,
        holder_id: holderId,
        amount: String(input.amount),
        payment_date: input.payment_date,
        notes: input.notes || 'Bill Payment',
      })
      .returning();
    const allocations = await planAllocations(tx, payment, input.amount, specOf(input));
    await writeAllocations(tx, payment, allocations, []);
    return payment.id;
  });
  return (await findCardPayment(userId, id))!;
}

export async function updateCardPayment(
  userId: string,
  id: string,
  input: UpdateCardPaymentInput,
): Promise<CardPaymentWithAllocations> {
  const existing = await findCardPayment(userId, id);
  if (!existing) throw new CardPaymentError('Not found', 404);

  const holderId = input.funded_by_holder_id
    ? await payerFor(userId, existing.card_id, existing.payment_date, input.funded_by_holder_id)
    : undefined;

  const changes = {
    ...(input.amount !== undefined && { amount: String(input.amount) }),
    ...(input.payment_date !== undefined && { payment_date: input.payment_date }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(holderId && { holder_id: holderId }),
  };

  await db.transaction(async (tx) => {
    // Lock the payment either way, so concurrent edits of its allocations queue up.
    const [payment] =
      Object.keys(changes).length > 0
        ? await tx.update(card_payments).set(changes).where(eq(card_payments.id, id)).returning()
        : await tx.select().from(card_payments).where(eq(card_payments.id, id)).for('update');
    const amount = Number(payment.amount);

    let spec = specOf(input);
    if (!('allocations' in spec) && !('transaction_ids' in spec) && input.amount !== undefined) {
      // A payment wholly against one transaction stays wholly against it when its amount changes.
      const [only] = existing.allocations;
      if (existing.allocations.length === 1 && paise(only.amount) === paise(existing.amount)) {
        spec = { transaction_ids: [only.transaction_id] };
      }
    }

    if ('allocations' in spec || 'transaction_ids' in spec) {
      const before = await allocatedTransactionIds(tx, id);
      const allocations = await planAllocations(tx, payment, amount, spec);
      await writeAllocations(tx, payment, allocations, before);
    } else {
      const allocated = existing.allocations.reduce((sum, a) => sum + paise(a.amount), 0);
      if (allocated > paise(amount)) {
        throw new CardPaymentError(
          `Payment is allocated ${(allocated / 100).toFixed(2)}; it cannot be less than that`,
        );
      }
    }
  });
  return (await findCardPayment(userId, id))!;
}

/** Deletes the payment; what it settled is recomputed from the allocations that remain. */
export async function deleteCardPayment(userId: string, id: string): Promise<boolean> {
  if (!(await findCardPayment(userId, id))) return false;
  await db.transaction(async (tx) => {
    const affected = await allocatedTransactionIds(tx, id);
    await tx.delete(card_payments).where(eq(card_payments.id, id));
    await recomputeSettlement(tx, affected);
  });
  return true;
}

/**
 * Older Android builds send a split payment as the full payment followed by one request per
 * share. A share is an allocation on that payment; an unlinked share (the "Unallocated" rest) is
 * already implied by the payment's amount.
 */
export async function addShareToPayment(
  userId: string,
  paymentId: string,
  cardId: string,
  transactionId: string | undefined,
  amount: number,
): Promise<CardPaymentWithAllocations> {
  const existing = await findCardPayment(userId, paymentId);
  if (!existing || existing.card_id !== cardId) {
    throw new CardPaymentError('Parent payment is not on this card');
  }
  if (!transactionId) return existing;
  const merged = new Map(existing.allocations.map((a) => [a.transaction_id, Number(a.amount)]));
  merged.set(transactionId, (merged.get(transactionId) ?? 0) + amount);
  return updateCardPayment(userId, paymentId, {
    allocations: [...merged].map(([transaction_id, a]) => ({ transaction_id, amount: a })),
  });
}

function specOf(input: {
  allocations?: AllocationSpecItem[];
  transaction_ids?: string[];
}): AllocationSpec {
  if (input.allocations) return { allocations: input.allocations };
  if (input.transaction_ids) return { transaction_ids: input.transaction_ids };
  return {};
}
type AllocationSpecItem = { transaction_id: string; amount: number };

/** Who paid: the funder if given (must be the user's), else whoever had the card that day. */
async function payerFor(
  userId: string,
  cardId: string,
  date: unknown,
  fundedBy: string | undefined,
): Promise<string> {
  if (fundedBy) {
    if (!(await ownsHolder(userId, fundedBy))) throw new CardPaymentError('Unknown holder');
    return fundedBy;
  }
  const holderId = await resolveCardHolder(userId, cardId, isoDay(date));
  if (!holderId) throw new CardPaymentError('No holder found for this card', 422);
  return holderId;
}

/**
 * Turns an allocation spec into concrete allocations, checking rules 1-3. Locks the named
 * transactions, and reads what each still owes net of every other payment's allocations.
 */
async function planAllocations(
  tx: Tx,
  payment: CardPaymentRow,
  amount: number,
  spec: AllocationSpec,
): Promise<AllocationSpecItem[]> {
  const ids =
    'allocations' in spec
      ? spec.allocations.map((a) => a.transaction_id)
      : 'transaction_ids' in spec
        ? spec.transaction_ids
        : [];
  if (ids.length === 0) return [];
  if (new Set(ids).size !== ids.length) throw new CardPaymentError('A transaction is listed twice');

  const locked = await tx
    .select({
      id: transactions.id,
      card_id: transactions.card_id,
      amount: transactions.amount,
      type: transactions.type,
    })
    .from(transactions)
    .where(inArray(transactions.id, ids))
    .for('update');
  const byId = new Map(locked.map((t) => [t.id, t]));
  for (const tid of ids) {
    const t = byId.get(tid);
    if (!t || t.card_id !== payment.card_id) {
      throw new CardPaymentError('Linked transaction is not on this card');
    }
    if (t.type !== 'spend') throw new CardPaymentError('Only spend can be settled by a payment');
  }

  const othersRes = await tx.execute(sql`
    SELECT transaction_id, SUM(amount) AS allocated FROM card_payment_allocations
    WHERE card_payment_id <> ${payment.id}
      AND transaction_id IN (${sql.join(
        ids.map((i) => sql`${i}::uuid`),
        sql`, `,
      )})
    GROUP BY transaction_id`);
  const others = new Map(
    (othersRes.rows as Array<{ transaction_id: string; allocated: string }>).map((r) => [
      r.transaction_id,
      paise(r.allocated),
    ]),
  );
  const remainingPaise = (tid: string) => paise(byId.get(tid)!.amount) - (others.get(tid) ?? 0);

  if ('transaction_ids' in spec) {
    return distributePayment(
      amount,
      ids.map((tid) => ({ transaction_id: tid, remaining: remainingPaise(tid) / 100 })),
    ).allocations;
  }

  let total = 0;
  for (const a of (spec as { allocations: AllocationSpecItem[] }).allocations) {
    if (paise(a.amount) > remainingPaise(a.transaction_id)) {
      throw new CardPaymentError(
        `Transaction ${a.transaction_id} only has ${(remainingPaise(a.transaction_id) / 100).toFixed(2)} left to pay`,
      );
    }
    total += paise(a.amount);
  }
  if (total > paise(amount)) {
    throw new CardPaymentError('Allocations add up to more than the payment');
  }
  return (spec as { allocations: AllocationSpecItem[] }).allocations;
}

/** Stores the allocations and recomputes settlement for everything they touched, old and new. */
async function writeAllocations(
  tx: Tx,
  payment: CardPaymentRow,
  allocations: AllocationSpecItem[],
  previouslyAllocated: string[],
) {
  await replaceAllocations(tx, payment.id, allocations);
  await recomputeSettlement(tx, [
    ...previouslyAllocated,
    ...allocations.map((a) => a.transaction_id),
  ]);
}

function isoDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value ?? '').split('T')[0];
}
