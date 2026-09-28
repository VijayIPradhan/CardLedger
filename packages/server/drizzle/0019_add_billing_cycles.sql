-- Migration: Add billing cycles system
-- Date: 2026-09-28

-- Create billing_cycles table
CREATE TABLE IF NOT EXISTS billing_cycles (
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

  UNIQUE(card_id, cycle_start, cycle_end)
);

CREATE INDEX idx_cycles_card_date ON billing_cycles(card_id, statement_date DESC);
CREATE INDEX idx_cycles_due_date ON billing_cycles(payment_due_date) WHERE status IN ('generated', 'overdue');

-- Add billing_cycle_id to transactions table
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS billing_cycle_id UUID REFERENCES billing_cycles(id);

CREATE INDEX IF NOT EXISTS idx_transactions_cycle ON transactions(billing_cycle_id)
  WHERE billing_cycle_id IS NOT NULL;

-- Add billing_cycle_id to card_payments table
ALTER TABLE card_payments
  ADD COLUMN IF NOT EXISTS billing_cycle_id UUID REFERENCES billing_cycles(id);

CREATE INDEX IF NOT EXISTS idx_card_payments_cycle ON card_payments(billing_cycle_id)
  WHERE billing_cycle_id IS NOT NULL;
