-- Migration: Add parent payment tracking for distributed payments
-- Date: 2026-09-28

-- Add parent_payment_id to card_payments for tracking payment distribution
ALTER TABLE card_payments
  ADD COLUMN IF NOT EXISTS parent_payment_id UUID REFERENCES card_payments(id) ON DELETE CASCADE;

-- Add is_parent flag to identify original payments vs distributed allocations
ALTER TABLE card_payments
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN DEFAULT false;

-- Index for efficient querying of payment hierarchies
CREATE INDEX IF NOT EXISTS idx_card_payments_parent ON card_payments(parent_payment_id)
  WHERE parent_payment_id IS NOT NULL;

-- Index for efficient querying of parent payments
CREATE INDEX IF NOT EXISTS idx_card_payments_is_parent ON card_payments(is_parent)
  WHERE is_parent = true;

-- Comments for clarity
COMMENT ON COLUMN card_payments.parent_payment_id IS 'Links distributed payment allocations to their parent payment';
COMMENT ON COLUMN card_payments.is_parent IS 'True if this is an original payment that was distributed (parent), false if it is an allocation (child)';

/*
Usage Example:
- User makes ₹10,000 payment
  1. Create parent record: amount=10000, is_parent=true, transaction_id=null
  2. Create child records:
     - amount=5000, is_parent=false, parent_payment_id=[parent_id], transaction_id=[txn1_id]
     - amount=2000, is_parent=false, parent_payment_id=[parent_id], transaction_id=[txn2_id]
     - amount=3000, is_parent=false, parent_payment_id=[parent_id], transaction_id=[txn3_id]

- Query shows:
  * Parent: ₹10,000 (2026-09-28)
    * → Transaction A: ₹5,000
    * → Transaction B: ₹2,000
    * → Transaction C: ₹3,000
*/
