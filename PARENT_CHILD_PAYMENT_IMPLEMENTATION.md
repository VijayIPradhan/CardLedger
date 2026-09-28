# Parent-Child Payment Structure Implementation

## Summary
Implemented a parent-child payment tracking system to solve the payment distribution problem. When a user makes a ₹10,000 payment distributed across multiple transactions, the system now creates a parent payment record (₹10,000) with child allocations linked to it.

## Problem Solved
**Before**: Making a ₹10,000 payment and distributing it across 3 transactions created 3 separate payment records, losing context of the original payment.

**After**: Creates a hierarchical structure:
- Parent payment: ₹10,000 (original payment, visible to user)
- Child payments: 3 allocations (₹5k, ₹2k, ₹3k) linked to parent via `parent_payment_id`

## Files Modified

### 1. Android DTOs (`packages/android-native/app/src/main/java/com/imvj/cardledger/data/net/Dtos.kt`)

**Changes:**
- Added `parent_payment_id` and `is_parent` fields to `TransactionDto`
- Added `parent_payment_id` and `is_parent` fields to `CardPaymentItemDto`
- Added `transaction_id` field to `CardPaymentItemDto`
- Created new `CardPaymentWithChildren` DTO for hierarchical display
- Added `parent_payment_id` field to `CreateTransactionDto`

**Key additions:**
```kotlin
@Serializable
data class TransactionDto(
    // ... existing fields ...
    val parent_payment_id: String? = null,
    val is_parent: Boolean? = null,
)

@Serializable
data class CardPaymentWithChildren(
    val parent: CardPaymentItemDto,
    val children: List<CardPaymentItemDto> = emptyList(),
)
```

### 2. Android ViewModel (`packages/android-native/app/src/main/java/com/imvj/cardledger/feature/CardDetailViewModel.kt`)

**Changes:**
- Completely rewrote `recordBillPayment` method to implement parent-child structure
- Creates parent payment first with full amount (no linked transaction)
- Creates child allocations with `parent_payment_id` set to parent's ID
- Each child links to a specific transaction via `linked_transaction_id`

**Flow:**
1. Create parent payment (amount=10000, is_parent=true, transaction_id=null)
2. Get parent payment ID from response
3. Create child allocations (amount=5000, parent_payment_id=[parent_id], transaction_id=[txn1])
4. Repeat for each transaction in distribution
5. Create excess allocation if payment exceeds total bills

### 3. Android UI (`packages/android-native/app/src/main/java/com/imvj/cardledger/ui/screens/CardDetailScreen.kt`)

**Changes:**
- Added `expandedParentPayments` state to track which parent payments are expanded
- Modified transaction rendering to group payments by parent-child relationship
- Implemented collapsible parent payment display with expand/collapse icons
- Shows children with indentation and connector lines (├─)
- Parent payments have gold background with distinct styling
- Children show linked transaction details or "Unallocated" label

**UI Design:**
```
💳 🏦 Payment to Bank               +₹10,000
      Paid on 2026-09-28
      Distributed to 3 transactions     [Expand ▼]

    ├─ Amazon                      +₹5,000
       2026-01-05
    ├─ Flipkart                    +₹2,000
       2026-01-06
    ├─ Swiggy                      +₹3,000
       2026-01-07
```

### 4. Server API (`packages/server/src/routes/transactions.ts`)

**Changes:**
- Updated POST `/transactions` endpoint to accept `parent_payment_id`
- Modified card_payment creation to set `is_parent` flag automatically
- Logic: If no `linked_transaction_id` and no `parent_payment_id`, then `is_parent=true`
- Returns `parent_payment_id` and `is_parent` in formatted payment responses

**Key logic:**
```typescript
const isParent = !linked_transaction_id && !(parsed.data as any).parent_payment_id;

await tx.insert(card_payments).values({
    // ... existing fields ...
    parent_payment_id: (parsed.data as any).parent_payment_id || null,
    is_parent: isParent,
})
```

### 5. Server Schema Validation (`packages/shared/src/schemas/index.ts`)

**Changes:**
- Added `parent_payment_id` field to `CreateTransactionSchema`
- Field is optional and validates as UUID

## Database Schema (Already Applied - Migration 0020)

```sql
ALTER TABLE card_payments
  ADD COLUMN parent_payment_id UUID REFERENCES card_payments(id) ON DELETE CASCADE,
  ADD COLUMN is_parent BOOLEAN DEFAULT false;

CREATE INDEX idx_card_payments_parent ON card_payments(parent_payment_id)
  WHERE parent_payment_id IS NOT NULL;
  
CREATE INDEX idx_card_payments_is_parent ON card_payments(is_parent)
  WHERE is_parent = true;
```

## Testing Instructions

### Test 1: Basic Parent-Child Payment Creation

1. **Open CardDetailScreen** for a card with unpaid transactions
2. **Tap "Pay Credit Card Bill"** button
3. **Enter payment details:**
   - Amount: ₹10,000
   - Date: Today
   - Funded By: Me
4. **Select 3 transactions** from the bill selection list:
   - Transaction 1: ₹5,000 remaining
   - Transaction 2: ₹2,000 remaining
   - Transaction 3: ₹3,000 remaining
5. **Tap "Save Payment"**

**Expected Result:**
- Parent payment created: ₹10,000 (visible in transaction list)
- 3 child allocations created (not visible individually, only under parent)
- Parent shows "Distributed to 3 transactions"
- Parent payment has expand/collapse arrow

### Test 2: Expand/Collapse Parent Payment

1. **Find the parent payment** in the transaction list (gold background)
2. **Tap to expand**
   - Should show 3 child allocations with ├─ connector
   - Each child shows linked transaction details
   - Each child shows allocated amount
3. **Tap again to collapse**
   - Children should hide with smooth animation
   - Only parent row remains visible

### Test 3: Payment Exceeding Bills (Excess Allocation)

1. **Create payment** with amount greater than selected bills:
   - Amount: ₹15,000
   - Select transactions totaling ₹10,000
2. **Save payment**

**Expected Result:**
- Parent payment: ₹15,000
- 3 child allocations for selected transactions: ₹10,000 total
- 1 additional child allocation: ₹5,000 labeled "Payment to Bank (Unallocated)"
- Parent shows "Distributed to 4 transactions"

### Test 4: Verify Database Records

```sql
-- Check parent payment
SELECT id, amount, is_parent, parent_payment_id, transaction_id
FROM card_payments
WHERE is_parent = true
ORDER BY created_at DESC
LIMIT 1;

-- Check child allocations
SELECT id, amount, is_parent, parent_payment_id, transaction_id
FROM card_payments
WHERE parent_payment_id = '<parent_id_from_above>'
ORDER BY created_at;

-- Verify child amounts sum to parent
SELECT 
    p.id AS parent_id,
    p.amount AS parent_amount,
    SUM(c.amount) AS children_total
FROM card_payments p
LEFT JOIN card_payments c ON c.parent_payment_id = p.id
WHERE p.is_parent = true
GROUP BY p.id, p.amount;
```

### Test 5: Verify Transaction Updates

After creating a payment that covers a transaction:
1. **Check the spend transaction** in the database
2. **Verify `payments_received` field** is updated
3. **Verify `is_paid` flag** is set to true if fully paid

```sql
SELECT id, amount, payments_received, is_paid
FROM transactions
WHERE id = '<linked_transaction_id>';
```

### Test 6: API Response Validation

**Request:**
```bash
POST /transactions
{
  "card_id": "...",
  "amount": 10000,
  "merchant": "Payment to Bank",
  "txn_date": "2026-09-28",
  "source": "manual",
  "type": "bill_payment",
  "funded_by_holder_id": "...",
  "linked_transaction_id": null
}
```

**Expected Response:**
```json
{
  "id": "parent-payment-id",
  "parent_payment_id": null,
  "is_parent": true,
  ...
}
```

**Child Creation Request:**
```bash
POST /transactions
{
  "card_id": "...",
  "amount": 5000,
  "merchant": "Payment to Bank",
  "txn_date": "2026-09-28",
  "source": "manual",
  "type": "bill_payment",
  "funded_by_holder_id": "...",
  "linked_transaction_id": "txn-1-id",
  "parent_payment_id": "parent-payment-id"
}
```

**Expected Response:**
```json
{
  "id": "child-payment-id",
  "parent_payment_id": "parent-payment-id",
  "is_parent": false,
  "linked_transaction_id": "txn-1-id",
  ...
}
```

## Edge Cases Handled

1. **Payment with no transaction selection**: Creates parent with no children
2. **Payment exceeding bill amounts**: Creates "Unallocated" child allocation
3. **Partial payment**: Distributes proportionally, remaining shown in transaction
4. **Old payments (created before this feature)**: Displayed normally without parent-child UI
5. **Zero amount allocations**: Skipped during distribution

## Design Guidelines Followed

- **Theme Colors**: Gold for parent payments, Success for amounts
- **Icons**: KeyboardArrowDown/Up for expand/collapse
- **Indentation**: 24dp for children
- **Connector**: "├─" character for child items
- **Background**: Gold.copy(alpha = 0.08f) for parent, Elevated for children
- **Border**: Gold.copy(alpha = 0.3f) for parent payments

## Performance Considerations

- **Indexed fields**: `parent_payment_id` and `is_parent` are indexed
- **Cascade delete**: Deleting parent automatically removes children
- **Grouped queries**: Children fetched once and grouped by parent_id
- **Lazy rendering**: Children only rendered when parent is expanded

## Migration Path

**Existing payments remain unchanged:**
- Old payments have `parent_payment_id = null` and `is_parent = false`
- They display normally without parent-child UI
- No backfill needed for historical data

## Future Enhancements

1. **Bulk edit**: Allow editing parent payment amount with automatic child adjustment
2. **Reallocation UI**: Drag-and-drop to reallocate amounts between children
3. **Payment history**: Show complete payment tree in a dedicated view
4. **Export**: Include parent-child hierarchy in CSV export
5. **Analytics**: Report on payment distribution patterns

## Rollback Plan

If issues arise:
1. Revert ViewModel changes to create flat payments (no parent_payment_id)
2. UI will show all payments as before (parent-child logic is additive)
3. Database fields remain (backward compatible)
4. No data loss - existing records unaffected
