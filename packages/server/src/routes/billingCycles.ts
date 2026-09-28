import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { billing_cycles, cards, transactions, card_payments } from '../db/schema.js';
import { eq, and, desc, sql, between, gte, lte } from 'drizzle-orm';

type CycleStatus = 'projected' | 'generated' | 'paid' | 'overdue';

interface CreateCycleBody {
  card_id: string;
  cycle_start: string;
  cycle_end: string;
  statement_date: string;
  payment_due_date: string;
  statement_amount: number;
  minimum_due?: number;
  notes?: string;
}

interface UpdateCycleBody {
  paid_amount?: number;
  paid_on?: string;
  status?: CycleStatus;
  is_locked?: boolean;
  statement_amount?: number;
  minimum_due?: number;
  notes?: string;
}

function formatDate(d: any): string {
  if (d instanceof Date) {
    return d.toISOString().split('T')[0];
  } else if (typeof d === 'string') {
    return d.split('T')[0];
  }
  return d;
}

export async function billingCycleRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  // GET /billing-cycles - List billing cycles for authenticated user
  app.get<{ Querystring: { card_id?: string; status?: CycleStatus } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { card_id, status } = req.query;

    const conditions: any[] = [eq(cards.user_id, userId)];
    if (card_id) conditions.push(eq(billing_cycles.card_id, card_id));
    if (status) conditions.push(eq(billing_cycles.status, status));

    // Aggregate transaction and card_payment counts per cycle
    const cycles = await db
      .select({
        id: billing_cycles.id,
        user_id: billing_cycles.user_id,
        card_id: billing_cycles.card_id,
        cycle_start: billing_cycles.cycle_start,
        cycle_end: billing_cycles.cycle_end,
        statement_date: billing_cycles.statement_date,
        payment_due_date: billing_cycles.payment_due_date,
        total_spend: billing_cycles.total_spend,
        total_refunds: billing_cycles.total_refunds,
        previous_balance: billing_cycles.previous_balance,
        statement_amount: billing_cycles.statement_amount,
        minimum_due: billing_cycles.minimum_due,
        paid_amount: billing_cycles.paid_amount,
        paid_on: billing_cycles.paid_on,
        status: billing_cycles.status,
        is_locked: billing_cycles.is_locked,
        statement_pdf_url: billing_cycles.statement_pdf_url,
        notes: billing_cycles.notes,
        created_at: billing_cycles.created_at,
        updated_at: billing_cycles.updated_at,
        transaction_count: sql<number>`(
            SELECT COUNT(*)::int
            FROM ${transactions}
            WHERE ${transactions.billing_cycle_id} = ${billing_cycles.id}
          )`,
        card_payment_count: sql<number>`(
            SELECT COUNT(*)::int
            FROM ${card_payments}
            WHERE ${card_payments.billing_cycle_id} = ${billing_cycles.id}
          )`,
      })
      .from(billing_cycles)
      .innerJoin(cards, eq(billing_cycles.card_id, cards.id))
      .where(and(...conditions))
      .orderBy(desc(billing_cycles.statement_date));

    return cycles.map((c) => ({
      ...c,
      cycle_start: formatDate(c.cycle_start),
      cycle_end: formatDate(c.cycle_end),
      statement_date: formatDate(c.statement_date),
      payment_due_date: formatDate(c.payment_due_date),
      paid_on: c.paid_on ? formatDate(c.paid_on) : null,
    }));
  });

  // GET /billing-cycles/:id - Get single cycle details
  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;

    const [cycle] = await db
      .select()
      .from(billing_cycles)
      .innerJoin(cards, eq(billing_cycles.card_id, cards.id))
      .where(and(eq(billing_cycles.id, req.params.id), eq(cards.user_id, userId)));

    if (!cycle) return reply.status(404).send({ error: 'Not found' });

    // Fetch transactions in this cycle
    const cycleTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.billing_cycle_id, req.params.id))
      .orderBy(desc(transactions.txn_date));

    // Fetch card_payments in this cycle
    const cyclePayments = await db
      .select()
      .from(card_payments)
      .where(eq(card_payments.billing_cycle_id, req.params.id))
      .orderBy(desc(card_payments.payment_date));

    const cycleData = cycle.billing_cycles;

    return {
      ...cycleData,
      cycle_start: formatDate(cycleData.cycle_start),
      cycle_end: formatDate(cycleData.cycle_end),
      statement_date: formatDate(cycleData.statement_date),
      payment_due_date: formatDate(cycleData.payment_due_date),
      paid_on: cycleData.paid_on ? formatDate(cycleData.paid_on) : null,
      transactions: cycleTransactions.map((t) => ({
        ...t,
        txn_date: formatDate(t.txn_date),
      })),
      card_payments: cyclePayments.map((p) => ({
        ...p,
        payment_date: formatDate(p.payment_date),
      })),
    };
  });

  // POST /billing-cycles - Create a new billing cycle
  app.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const body = req.body as CreateCycleBody;

    // Validate required fields
    if (
      !body.card_id ||
      !body.cycle_start ||
      !body.cycle_end ||
      !body.statement_date ||
      !body.payment_due_date ||
      body.statement_amount === undefined
    ) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    // Verify card belongs to user
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.id, body.card_id), eq(cards.user_id, userId)));

    if (!card) return reply.status(404).send({ error: 'Card not found' });

    // Calculate total_spend and total_refunds from transactions in date range
    const cycleTransactions = await db
      .select({
        amount: transactions.amount,
        type: transactions.type,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.card_id, body.card_id),
          gte(transactions.txn_date, body.cycle_start),
          lte(transactions.txn_date, body.cycle_end),
        ),
      );

    let total_spend = 0;
    let total_refunds = 0;

    cycleTransactions.forEach((txn) => {
      const amount = parseFloat(String(txn.amount));
      if (txn.type === 'refund') {
        total_refunds += amount;
      } else if (txn.type === 'spend') {
        total_spend += amount;
      }
    });

    // Create the billing cycle
    const [newCycle] = await db
      .insert(billing_cycles)
      .values({
        user_id: userId,
        card_id: body.card_id,
        cycle_start: body.cycle_start,
        cycle_end: body.cycle_end,
        statement_date: body.statement_date,
        payment_due_date: body.payment_due_date,
        statement_amount: String(body.statement_amount),
        minimum_due: body.minimum_due !== undefined ? String(body.minimum_due) : null,
        notes: body.notes || null,
        total_spend: String(total_spend),
        total_refunds: String(total_refunds),
        status: 'generated',
        is_locked: false,
      })
      .returning();

    return reply.status(201).send({
      ...newCycle,
      cycle_start: formatDate(newCycle.cycle_start),
      cycle_end: formatDate(newCycle.cycle_end),
      statement_date: formatDate(newCycle.statement_date),
      payment_due_date: formatDate(newCycle.payment_due_date),
      paid_on: newCycle.paid_on ? formatDate(newCycle.paid_on) : null,
    });
  });

  // PATCH /billing-cycles/:id - Update cycle
  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const body = req.body as UpdateCycleBody;

    // Verify user owns the cycle via card
    const [existing] = await db
      .select({
        cycle_id: billing_cycles.id,
        is_locked: billing_cycles.is_locked,
        payment_due_date: billing_cycles.payment_due_date,
        status: billing_cycles.status,
      })
      .from(billing_cycles)
      .innerJoin(cards, eq(billing_cycles.card_id, cards.id))
      .where(and(eq(billing_cycles.id, req.params.id), eq(cards.user_id, userId)));

    if (!existing) return reply.status(404).send({ error: 'Not found' });

    // Cannot edit if locked
    if (existing.is_locked) {
      return reply.status(403).send({ error: 'Cannot edit locked billing cycle' });
    }

    // Auto-detect overdue status
    const today = new Date().toISOString().split('T')[0];
    const dueDate = formatDate(existing.payment_due_date);
    let finalStatus = body.status || existing.status;

    if (
      existing.status === 'generated' &&
      dueDate < today &&
      (!body.status || body.status === 'generated')
    ) {
      finalStatus = 'overdue';
    }

    // Build update object
    const update: any = {};
    if (body.paid_amount !== undefined) update.paid_amount = String(body.paid_amount);
    if (body.paid_on !== undefined) update.paid_on = body.paid_on;
    if (body.status !== undefined) update.status = body.status;
    if (body.is_locked !== undefined) update.is_locked = body.is_locked;
    if (body.statement_amount !== undefined)
      update.statement_amount = String(body.statement_amount);
    if (body.minimum_due !== undefined) update.minimum_due = String(body.minimum_due);
    if (body.notes !== undefined) update.notes = body.notes;

    // Apply auto-detected status
    if (finalStatus !== existing.status) {
      update.status = finalStatus;
    }

    update.updated_at = sql`NOW()`;

    const [updatedCycle] = await db
      .update(billing_cycles)
      .set(update)
      .where(eq(billing_cycles.id, req.params.id))
      .returning();

    return {
      ...updatedCycle,
      cycle_start: formatDate(updatedCycle.cycle_start),
      cycle_end: formatDate(updatedCycle.cycle_end),
      statement_date: formatDate(updatedCycle.statement_date),
      payment_due_date: formatDate(updatedCycle.payment_due_date),
      paid_on: updatedCycle.paid_on ? formatDate(updatedCycle.paid_on) : null,
    };
  });

  // POST /billing-cycles/:id/close - Close and lock a cycle
  app.post<{ Params: { id: string } }>('/:id/close', auth, async (req, reply) => {
    const userId = req.user.sub;

    // Verify user owns the cycle via card
    const [existing] = await db
      .select({
        cycle_id: billing_cycles.id,
        statement_amount: billing_cycles.statement_amount,
      })
      .from(billing_cycles)
      .innerJoin(cards, eq(billing_cycles.card_id, cards.id))
      .where(and(eq(billing_cycles.id, req.params.id), eq(cards.user_id, userId)));

    if (!existing) return reply.status(404).send({ error: 'Not found' });

    // Calculate total paid_amount from card_payments
    const paymentsResult = await db
      .select({
        total: sql<string>`COALESCE(SUM(${card_payments.amount}), 0)`,
      })
      .from(card_payments)
      .where(eq(card_payments.billing_cycle_id, req.params.id));

    const totalPaid = parseFloat(paymentsResult[0]?.total || '0');
    const statementAmount = parseFloat(String(existing.statement_amount));

    // Determine final status
    const today = new Date().toISOString().split('T')[0];
    const finalStatus: CycleStatus = totalPaid >= statementAmount ? 'paid' : 'generated';
    const paidOn = totalPaid >= statementAmount ? today : null;

    // Update cycle: lock and set final status
    const [updatedCycle] = await db
      .update(billing_cycles)
      .set({
        is_locked: true,
        paid_amount: String(totalPaid),
        status: finalStatus,
        paid_on: paidOn,
        updated_at: sql`NOW()`,
      })
      .where(eq(billing_cycles.id, req.params.id))
      .returning();

    return {
      ...updatedCycle,
      cycle_start: formatDate(updatedCycle.cycle_start),
      cycle_end: formatDate(updatedCycle.cycle_end),
      statement_date: formatDate(updatedCycle.statement_date),
      payment_due_date: formatDate(updatedCycle.payment_due_date),
      paid_on: updatedCycle.paid_on ? formatDate(updatedCycle.paid_on) : null,
    };
  });
}
