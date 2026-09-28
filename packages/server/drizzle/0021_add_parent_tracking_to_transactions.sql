-- Migration: Add parent payment tracking fields to transactions table
-- Date: 2026-09-28
-- Reason: Bill payments are stored as transactions (type='bill_payment'), not card_payments

-- Add parent_payment_id to transactions for tracking payment distribution
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_payment_id UUID REFERENCES transactions(id) ON DELETE CASCADE;

-- Add is_parent flag to identify original payments vs distributed allocations
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN DEFAULT false;

-- Add linked_transaction_id to link bill payments to the transactions they pay off
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON transactions(parent_payment_id)
  WHERE parent_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_is_parent ON transactions(is_parent)
  WHERE is_parent = true;

CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

-- Comments for clarity
COMMENT ON COLUMN transactions.parent_payment_id IS 'Links distributed bill payment allocations to their parent payment';
COMMENT ON COLUMN transactions.is_parent IS 'True if this is an original payment that was distributed (parent), false if it is an allocation (child)';
COMMENT ON COLUMN transactions.linked_transaction_id IS 'For bill_payment transactions, the spend transaction this payment applies to';

/*
Usage Example:
- User makes ₹10,000 payment to bank, selecting 3 transactions
  1. Create parent record: amount=10000, is_parent=true, linked_transaction_id=null, type=bill_payment
  2. Create child records:
     - amount=5000, is_parent=false, parent_payment_id=[parent_id], linked_transaction_id=[txn1_id], type=bill_payment
     - amount=2000, is_parent=false, parent_payment_id=[parent_id], linked_transaction_id=[txn2_id], type=bill_payment
     - amount=3000, is_parent=false, parent_payment_id=[parent_id], linked_transaction_id=[txn3_id], type=bill_payment

When parent is deleted:
  - CASCADE deletes all children automatically
  - Server must revert is_paid status on linked transactions
*/
