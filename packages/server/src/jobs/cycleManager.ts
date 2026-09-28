import { db } from '../db/index.js';
import { billing_cycles, transactions, card_payments, cards } from '../db/schema.js';
import { eq, and, lt, isNull, between, gte, lte, sql } from 'drizzle-orm';

interface CycleManagerStats {
  overdueUpdated: number;
  transactionsLinked: number;
  paymentsLinked: number;
  cyclesGenerated: number;
}

/**
 * Daily job for automatic billing cycle management.
 *
 * Operations:
 * 1. Mark overdue cycles (status='generated' && payment_due_date < today)
 * 2. Auto-link transactions to cycles (transaction.txn_date within cycle bounds)
 * 3. Auto-link card_payments to cycles (payment_date within cycle bounds)
 * 4. Generate projected cycles for upcoming billing periods
 */
export async function runCycleManager(): Promise<CycleManagerStats> {
  const stats: CycleManagerStats = {
    overdueUpdated: 0,
    transactionsLinked: 0,
    paymentsLinked: 0,
    cyclesGenerated: 0,
  };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  console.log(`[CycleManager] Starting job at ${new Date().toISOString()}`);

  try {
    // Step 1: Mark overdue cycles
    console.log('[CycleManager] Step 1: Detecting overdue payments');
    stats.overdueUpdated = await markOverdueCycles(today);
    console.log(`[CycleManager] Marked ${stats.overdueUpdated} cycles as overdue`);

    // Step 2: Link transactions to cycles
    console.log('[CycleManager] Step 2: Linking transactions to cycles');
    stats.transactionsLinked = await linkTransactionsToCycles();
    console.log(`[CycleManager] Linked ${stats.transactionsLinked} transactions to cycles`);

    // Step 3: Link card payments to cycles
    console.log('[CycleManager] Step 3: Linking card payments to cycles');
    stats.paymentsLinked = await linkCardPaymentsToCycles();
    console.log(`[CycleManager] Linked ${stats.paymentsLinked} card payments to cycles`);

    // Step 4: Generate projected cycles (optional future enhancement)
    console.log('[CycleManager] Step 4: Generating projected cycles');
    stats.cyclesGenerated = await generateProjectedCycles(today);
    console.log(`[CycleManager] Generated ${stats.cyclesGenerated} projected cycles`);

    console.log('[CycleManager] Job completed successfully', stats);
    return stats;
  } catch (error) {
    console.error('[CycleManager] Job failed with error:', error);
    throw error;
  }
}

/**
 * Mark cycles as overdue if payment_due_date has passed
 */
async function markOverdueCycles(today: string): Promise<number> {
  return await db.transaction(async (tx) => {
    const overdueCycles = await tx
      .select({ id: billing_cycles.id })
      .from(billing_cycles)
      .where(
        and(eq(billing_cycles.status, 'generated'), lt(billing_cycles.payment_due_date, today)),
      );

    if (overdueCycles.length === 0) {
      return 0;
    }

    // Update in batches to avoid potential timeout on large datasets
    const batchSize = 100;
    let updated = 0;

    for (let i = 0; i < overdueCycles.length; i += batchSize) {
      const batch = overdueCycles.slice(i, i + batchSize);
      const ids = batch.map((c) => c.id);

      await tx
        .update(billing_cycles)
        .set({ status: 'overdue', updated_at: sql`NOW()` })
        .where(sql`${billing_cycles.id} = ANY(${ids}::uuid[])`);

      updated += batch.length;
    }

    return updated;
  });
}

/**
 * Link transactions without billing_cycle_id to their respective cycles
 */
async function linkTransactionsToCycles(): Promise<number> {
  return await db.transaction(async (tx) => {
    // Find all unlinked transactions
    const unlinkedTransactions = await tx
      .select({
        id: transactions.id,
        card_id: transactions.card_id,
        txn_date: transactions.txn_date,
      })
      .from(transactions)
      .where(isNull(transactions.billing_cycle_id));

    if (unlinkedTransactions.length === 0) {
      return 0;
    }

    console.log(`[CycleManager] Found ${unlinkedTransactions.length} unlinked transactions`);

    let linked = 0;

    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < unlinkedTransactions.length; i += batchSize) {
      const batch = unlinkedTransactions.slice(i, i + batchSize);

      for (const txn of batch) {
        // Find matching cycle for this transaction
        const matchingCycle = await tx
          .select({ id: billing_cycles.id })
          .from(billing_cycles)
          .where(
            and(
              eq(billing_cycles.card_id, txn.card_id),
              lte(billing_cycles.cycle_start, txn.txn_date),
              gte(billing_cycles.cycle_end, txn.txn_date),
            ),
          )
          .limit(1);

        if (matchingCycle.length > 0) {
          await tx
            .update(transactions)
            .set({ billing_cycle_id: matchingCycle[0].id })
            .where(eq(transactions.id, txn.id));

          linked++;
        }
      }
    }

    return linked;
  });
}

/**
 * Link card_payments without billing_cycle_id to their respective cycles
 */
async function linkCardPaymentsToCycles(): Promise<number> {
  return await db.transaction(async (tx) => {
    // Find all unlinked card payments
    const unlinkedPayments = await tx
      .select({
        id: card_payments.id,
        card_id: card_payments.card_id,
        payment_date: card_payments.payment_date,
      })
      .from(card_payments)
      .where(isNull(card_payments.billing_cycle_id));

    if (unlinkedPayments.length === 0) {
      return 0;
    }

    console.log(`[CycleManager] Found ${unlinkedPayments.length} unlinked card payments`);

    let linked = 0;

    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < unlinkedPayments.length; i += batchSize) {
      const batch = unlinkedPayments.slice(i, i + batchSize);

      for (const payment of batch) {
        // Find matching cycle for this payment
        const matchingCycle = await tx
          .select({ id: billing_cycles.id })
          .from(billing_cycles)
          .where(
            and(
              eq(billing_cycles.card_id, payment.card_id),
              lte(billing_cycles.cycle_start, payment.payment_date),
              gte(billing_cycles.cycle_end, payment.payment_date),
            ),
          )
          .limit(1);

        if (matchingCycle.length > 0) {
          await tx
            .update(card_payments)
            .set({ billing_cycle_id: matchingCycle[0].id })
            .where(eq(card_payments.id, payment.id));

          linked++;
        }
      }
    }

    return linked;
  });
}

/**
 * Generate projected cycles for cards that don't have a cycle for current period.
 * This is an optional future enhancement.
 */
async function generateProjectedCycles(today: string): Promise<number> {
  return await db.transaction(async (tx) => {
    // Get all cards
    const allCards = await tx
      .select({
        id: cards.id,
        user_id: cards.user_id,
        billing_cycle_day: cards.billing_cycle_day,
        payment_due_day: cards.payment_due_day,
      })
      .from(cards);

    if (allCards.length === 0) {
      return 0;
    }

    let generated = 0;

    for (const card of allCards) {
      // Calculate current cycle dates based on billing_cycle_day
      const cycleInfo = calculateCurrentCycleDates(
        today,
        card.billing_cycle_day,
        card.payment_due_day,
      );

      // Check if cycle already exists for this period
      const existingCycle = await tx
        .select({ id: billing_cycles.id })
        .from(billing_cycles)
        .where(
          and(
            eq(billing_cycles.card_id, card.id),
            eq(billing_cycles.cycle_start, cycleInfo.cycle_start),
            eq(billing_cycles.cycle_end, cycleInfo.cycle_end),
          ),
        )
        .limit(1);

      // Create projected cycle if it doesn't exist
      if (existingCycle.length === 0) {
        await tx.insert(billing_cycles).values({
          user_id: card.user_id,
          card_id: card.id,
          cycle_start: cycleInfo.cycle_start,
          cycle_end: cycleInfo.cycle_end,
          statement_date: cycleInfo.statement_date,
          payment_due_date: cycleInfo.payment_due_date,
          statement_amount: '0',
          status: 'projected',
          is_locked: false,
        });

        generated++;
      }
    }

    return generated;
  });
}

/**
 * Calculate cycle dates based on billing_cycle_day
 * Example: If billing_cycle_day is 5, cycles run from 5th to 4th of next month
 */
function calculateCurrentCycleDates(
  today: string,
  billing_cycle_day: number,
  payment_due_day: number,
): {
  cycle_start: string;
  cycle_end: string;
  statement_date: string;
  payment_due_date: string;
} {
  const currentDate = new Date(today);
  const currentDay = currentDate.getDate();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  let cycleStartDate: Date;
  let cycleEndDate: Date;

  // Determine if we're in the current cycle or need to look at previous/next cycle
  if (currentDay >= billing_cycle_day) {
    // Current cycle: billing_cycle_day of this month to (billing_cycle_day - 1) of next month
    cycleStartDate = new Date(currentYear, currentMonth, billing_cycle_day);
    cycleEndDate = new Date(currentYear, currentMonth + 1, billing_cycle_day - 1);
  } else {
    // Previous cycle: billing_cycle_day of last month to (billing_cycle_day - 1) of this month
    cycleStartDate = new Date(currentYear, currentMonth - 1, billing_cycle_day);
    cycleEndDate = new Date(currentYear, currentMonth, billing_cycle_day - 1);
  }

  // Statement date is typically the cycle end date
  const statementDate = new Date(cycleEndDate);

  // Payment due date is typically 20-25 days after statement date
  // We'll use the payment_due_day from the card
  const paymentDueDate = new Date(cycleEndDate);
  paymentDueDate.setDate(payment_due_day);

  // If payment_due_day is before the cycle_end day, it means next month
  if (payment_due_day <= cycleEndDate.getDate()) {
    paymentDueDate.setMonth(paymentDueDate.getMonth() + 1);
  }

  return {
    cycle_start: formatDate(cycleStartDate),
    cycle_end: formatDate(cycleEndDate),
    statement_date: formatDate(statementDate),
    payment_due_date: formatDate(paymentDueDate),
  };
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
