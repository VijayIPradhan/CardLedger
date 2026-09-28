# Phase 2: Billing Cycle Snapshots

## Problem

Currently, billing cycles are computed dynamically from transactions. This means:
- ❌ Editing a past transaction changes historical cycle totals
- ❌ Can't answer "What was my September bill amount?" if transactions were edited later
- ❌ No way to track "which bill paid which cycle's usage"
- ❌ Statement amounts must be manually compared to computed totals

## Solution: Cycle Snapshot System

### Schema Changes

#### New Table: `billing_cycles`
```sql
CREATE TABLE billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  
  -- Cycle period
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  statement_date DATE NOT NULL, -- When bank generated statement
  payment_due_date DATE NOT NULL, -- When payment is due
  
  -- Snapshot amounts (captured at statement generation)
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0, -- Gross spend in cycle
  total_refunds NUMERIC(12,2) NOT NULL DEFAULT 0,
  previous_balance NUMERIC(12,2) NOT NULL DEFAULT 0, -- Carried forward
  statement_amount NUMERIC(12,2) NOT NULL, -- What bank says you owe
  minimum_due NUMERIC(12,2), -- Minimum payment (if available)
  
  -- Payment tracking
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0, -- Sum of card_payments
  paid_on DATE, -- When fully paid (nullable if partial/unpaid)
  
  -- Status
  status VARCHAR(20) DEFAULT 'projected', -- 'projected', 'generated', 'paid', 'overdue'
  is_locked BOOLEAN DEFAULT false, -- Lock prevents editing transactions in this cycle
  
  -- Metadata
  statement_pdf_url TEXT, -- Link to uploaded statement
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(card_id, cycle_start, cycle_end),
  INDEX idx_cycles_card_date (card_id, statement_date DESC),
  INDEX idx_cycles_due_date (payment_due_date) WHERE status IN ('generated', 'overdue')
);
```

#### Update `transactions` table
```sql
ALTER TABLE transactions 
  ADD COLUMN billing_cycle_id UUID REFERENCES billing_cycles(id);

CREATE INDEX idx_transactions_cycle ON transactions(billing_cycle_id) 
  WHERE billing_cycle_id IS NOT NULL;
```

#### Update `card_payments` table
```sql
ALTER TABLE card_payments 
  ADD COLUMN billing_cycle_id UUID REFERENCES billing_cycles(id);

CREATE INDEX idx_card_payments_cycle ON card_payments(billing_cycle_id) 
  WHERE billing_cycle_id IS NOT NULL;
```

### Cycle Lifecycle

```
[PROJECTED] → [GENERATED] → [PAID] / [OVERDUE]
    ↓              ↓              ↓
  Editable    Semi-locked    Locked
```

**PROJECTED**: Auto-created for next 3 cycles
- Transactions can be added/edited freely
- Amounts update dynamically
- Used for "next bill estimate"

**GENERATED**: Statement date has passed
- Bank statement received (manual or uploaded)
- User enters/confirms `statement_amount`
- Status becomes 'generated'
- Transactions can still be edited but show warning

**PAID**: Full payment recorded
- `paid_amount >= statement_amount`
- Sets `paid_on` date
- Can optionally lock cycle (prevent edits)

**OVERDUE**: Payment due date passed, still unpaid
- Triggers overdue reminders
- Shows prominently in UI

### New API Endpoints

**GET /billing-cycles?card_id=...&status=...**
```typescript
interface BillingCycleDto {
  id: string;
  cardId: string;
  cycleStart: string;
  cycleEnd: string;
  statementDate: string;
  paymentDueDate: string;
  
  totalSpend: number;
  totalRefunds: number;
  previousBalance: number;
  statementAmount: number;
  minimumDue?: number;
  
  paidAmount: number;
  paidOn?: string;
  
  status: 'projected' | 'generated' | 'paid' | 'overdue';
  isLocked: boolean;
  
  // Computed at request time
  daysUntilDue?: number;
  friendUsage: number; // Unpaid friend usage in this cycle
  meUsage: number; // My unpaid usage in this cycle
}
```

**POST /billing-cycles/:id/close**
- Close a cycle and mark as 'generated'
```typescript
{
  statementAmount: number; // What bank says you owe
  minimumDue?: number;
  previousBalance?: number; // If not auto-calculated
  statementPdfUrl?: string;
}
```

**POST /billing-cycles/:id/lock**
- Lock cycle to prevent transaction edits

**GET /billing-cycles/:id/transactions**
- All transactions in this cycle
- Grouped by holder

### Background Job: Cycle Manager

**Location**: `packages/server/src/jobs/cycleManager.ts`

```typescript
/**
 * Runs daily to:
 * 1. Create projected cycles for next 3 months
 * 2. Auto-close cycles whose statement date has passed
 * 3. Mark overdue cycles
 */
async function manageBillingCycles() {
  const cards = await db.select().from(cards);
  
  for (const card of cards) {
    // Create projected cycles
    await ensureProjectedCycles(card, 3); // Next 3 months
    
    // Auto-close if statement date passed
    const unclosedCycles = await db
      .select()
      .from(billing_cycles)
      .where(
        and(
          eq(billing_cycles.card_id, card.id),
          eq(billing_cycles.status, 'projected'),
          lte(billing_cycles.statement_date, new Date())
        )
      );
    
    for (const cycle of unclosedCycles) {
      // Calculate amounts from transactions
      const cycleData = await computeCycleTotals(cycle.id);
      
      await db.update(billing_cycles)
        .set({
          status: 'generated',
          total_spend: cycleData.totalSpend,
          total_refunds: cycleData.totalRefunds,
          statement_amount: cycleData.statementAmount, // User can edit this later
          updated_at: new Date(),
        })
        .where(eq(billing_cycles.id, cycle.id));
      
      // Create payment due reminder
      await createPaymentDueReminder(cycle);
    }
    
    // Mark overdue
    await db.update(billing_cycles)
      .set({ status: 'overdue' })
      .where(
        and(
          eq(billing_cycles.card_id, card.id),
          eq(billing_cycles.status, 'generated'),
          lte(billing_cycles.payment_due_date, new Date())
        )
      );
  }
}
```

### Transaction Linking

When creating a transaction:

```typescript
async function createTransaction(data: CreateTransactionDto) {
  // Find which cycle this transaction belongs to
  const cycle = await db
    .select()
    .from(billing_cycles)
    .where(
      and(
        eq(billing_cycles.card_id, data.card_id),
        lte(billing_cycles.cycle_start, data.txn_date),
        gte(billing_cycles.cycle_end, data.txn_date)
      )
    )
    .limit(1);
  
  if (cycle && cycle.isLocked) {
    throw new Error('Cannot add transaction to locked billing cycle');
  }
  
  const txn = await db.insert(transactions).values({
    ...data,
    billing_cycle_id: cycle?.id,
  });
  
  // Update cycle totals if status is still 'projected'
  if (cycle && cycle.status === 'projected') {
    await recomputeCycleTotals(cycle.id);
  }
  
  return txn;
}
```

### Shared Domain Logic Update

**Location**: `packages/shared/src/domain/billingCycle.ts`

Add new functions:

```typescript
/**
 * Get days until next statement date
 */
export function getDaysUntilStatement(billingCycleDay: number, today: string): number {
  const range = getCycleRange(billingCycleDay, today);
  const statementDate = range.end; // End of cycle = statement date
  
  const todayMs = new Date(today).getTime();
  const statementMs = new Date(statementDate).getTime();
  
  return Math.ceil((statementMs - todayMs) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate previous balance (unpaid from prior cycles)
 */
export function calculatePreviousBalance(
  priorCycles: Array<{ statementAmount: number; paidAmount: number }>
): number {
  return priorCycles.reduce((sum, cycle) => {
    return sum + Math.max(0, cycle.statementAmount - cycle.paidAmount);
  }, 0);
}
```

### Android App Changes

#### Update CardDetailScreen
- Show cycle status badges: [Projected], [Current], [Paid], [Overdue]
- Warn user when editing transactions in 'generated' cycles
- Show bill amount vs. paid amount progress bar

```kotlin
// Updated cycle UI
CycleGroup(
  label = cycle.label,
  status = cycle.status, // NEW
  statementAmount = cycle.statementAmount, // NEW
  paidAmount = cycle.paidAmount, // NEW
  isLocked = cycle.isLocked, // NEW
  txns = cycle.txns
)
```

#### New: BillingCyclesScreen
- List all cycles for a card
- Tap to see cycle details
- Action: "Close & Confirm Bill", "Mark Paid", "Lock Cycle"

#### Update Dashboard
- Show next bill amount from 'generated' cycle (if exists)
- Overdue cycles prominently displayed

### Migration Strategy

#### Drizzle Migration: `0019_add_billing_cycles.sql`
```sql
CREATE TABLE billing_cycles (...);

-- Add foreign keys to existing tables
ALTER TABLE transactions ADD COLUMN billing_cycle_id UUID;
ALTER TABLE card_payments ADD COLUMN billing_cycle_id UUID;

-- Backfill: Create historical cycles
-- This is a ONE-TIME heavy operation
INSERT INTO billing_cycles (user_id, card_id, cycle_start, cycle_end, statement_date, payment_due_date, status)
SELECT 
  c.user_id,
  c.id AS card_id,
  -- Generate cycles going back 24 months
  ...
FROM cards c;

-- Link existing transactions to cycles
UPDATE transactions t
SET billing_cycle_id = (
  SELECT bc.id 
  FROM billing_cycles bc
  WHERE bc.card_id = t.card_id
    AND t.txn_date >= bc.cycle_start
    AND t.txn_date <= bc.cycle_end
  LIMIT 1
);

-- Link existing card_payments to cycles
UPDATE card_payments cp
SET billing_cycle_id = (
  SELECT bc.id 
  FROM billing_cycles bc
  WHERE bc.card_id = cp.card_id
    AND cp.payment_date >= bc.cycle_start
    AND cp.payment_date <= bc.cycle_end
  LIMIT 1
);
```

## Benefits

✅ **Historical Accuracy**: Edit transactions without changing past bill amounts
✅ **Bill Verification**: Compare bank statement to computed amount
✅ **Payment Tracking**: Know which bill was paid when
✅ **Overdue Detection**: Automatic overdue status after payment_due_date
✅ **Lock Protection**: Optionally prevent accidental edits to closed cycles
✅ **Better Analytics**: Cycle-level aggregates for trends, forecasting
✅ **Projected Bills**: See "next bill estimate" before statement arrives

## Trade-offs

⚠️ **Complexity**: Adds another layer of state management
⚠️ **Migration Load**: Backfilling historical cycles is compute-heavy
⚠️ **Dual Truth**: Cycles have snapshot amounts + dynamic transaction lists (must handle drift)

## Estimated Effort

- **Schema + Migrations (incl. backfill)**: 8 hours
- **Server API endpoints**: 12 hours
- **Background cycle manager job**: 8 hours
- **Shared domain updates**: 4 hours
- **Android UI (cycle list + detail)**: 16 hours
- **Testing**: 12 hours

**Total**: ~7.5 days (~1.5 sprints)
