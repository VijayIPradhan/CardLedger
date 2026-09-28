# Phase 3: Fix Card Usage Display Bug

## Current Issue

**FlipkartAxis Card Shows:**
- Usage: ₹53,736 (WRONG)
- To Collect: ₹58,117 (CORRECT)

**Actual Data:**
- Total Unpaid on Card: ₹58,736 (Friend ₹58,117 + Me ₹619)
- Friend Unpaid: ₹58,117
- Card Payments Made: ₹98,331

**Expected Behavior:**
- **Usage**: Should show ₹58,736 (all unpaid spend on card, including "Me")
- **To Collect**: ₹58,117 (friend unpaid only) ✓ ALREADY CORRECT

## Root Cause Analysis

The bug is likely in how the Android app displays `friendUsage` vs. **total card usage**.

### Current API Response

```typescript
// From /dashboard/card/:cardId
{
  friendUsage: 58117, // Only friend unpaid ✓
  toCollect: 58117, // Only friend debt ✓
  collectedInHand: 0,
  friendBreakdown: [
    { holderId: "navin", holderName: "Navin Sharma", usage: 58117, owed: 58117 }
  ]
}
```

**Problem**: The API only returns `friendUsage`, not **total card usage** (friends + me).

### Where the Bug Happens

**Location**: `packages/android-native/app/src/main/java/com/imvj/cardledger/ui/screens/CardDetailScreen.kt:402`

```kotlin
// Unpaid usage, shown whenever it exceeds what is left to collect —
// cash and card payments come off toCollect but not off usage, so the
// two differ as soon as anything has been collected.
if (s.friendUsage > s.toCollect + 0.5) {
    val collected =
        if (s.collectedInHand > 0.5) " · Collected: +${money(s.collectedInHand)}" else ""
    Text(
        "Usage: ${money(s.friendUsage)}$collected", // ← ONLY shows friendUsage
        color = Muted,
        fontSize = 12.sp
    )
}
```

**The code shows `s.friendUsage` but comments say it should show card usage including "Me".**

## Solution

### Option A: Return Total Card Usage from Server (Recommended)

**Update**: `packages/shared/src/domain/cardDetail.ts:computeCardDetail()`

Add new field `totalCardUsage` to returned object:

```typescript
export interface CardDetailResult {
  cardId: string;
  toCollect: number; // Friend debt only
  collectedInHand: number;
  friendUsage: number; // Friend unpaid only
  totalCardUsage: number; // NEW: All unpaid on card (friends + me)
  friendCycleUsage: number;
  friendBreakdown: CardFriendBreakdown[];
  cycles: CardCycleGroup[];
  currentHolderId: string | null;
  collectedByTransaction: Record<string, number>;
}

export function computeCardDetail(input: CardDetailInput): CardDetailResult {
  // ... existing code ...
  
  // Compute total unpaid usage on this card (all holders)
  let totalCardUsage = 0;
  for (const t of cardTxns) {
    if (!t.is_paid) {
      if (t.type === 'spend') totalCardUsage += money(t.amount);
      else if (t.type === 'refund') totalCardUsage -= money(t.amount);
    }
  }
  
  return {
    // ... existing fields ...
    totalCardUsage: roundMoney(totalCardUsage), // NEW
  };
}
```

**Update Android DTO**: `packages/android-native/app/src/main/java/com/imvj/cardledger/data/net/Dtos.kt`

```kotlin
data class CardDetailDto(
    // ... existing fields ...
    val friendUsage: Double = 0.0,
    val totalCardUsage: Double = 0.0, // NEW
)
```

**Update ViewModel**: `packages/android-native/app/src/main/java/com/imvj/cardledger/feature/CardDetailViewModel.kt`

```kotlin
data class CardDetailUiState(
    // ... existing fields ...
    val friendUsage: Double = 0.0,
    val totalCardUsage: Double = 0.0, // NEW
)

// In load() function:
_state.value = CardDetailUiState(
    // ... existing ...
    friendUsage = detail?.friendUsage ?: 0.0,
    totalCardUsage = detail?.totalCardUsage ?: 0.0, // NEW
)
```

**Update UI**: `packages/android-native/app/src/main/java/com/imvj/cardledger/ui/screens/CardDetailScreen.kt:402`

```kotlin
// Show totalCardUsage instead of friendUsage
if (s.totalCardUsage > s.toCollect + 0.5) {
    val collected =
        if (s.collectedInHand > 0.5) " · Collected: +${money(s.collectedInHand)}" else ""
    Text(
        "Usage: ${money(s.totalCardUsage)}$collected", // ← Use totalCardUsage
        color = Muted,
        fontSize = 12.sp
    )
}
```

### Option B: Client-Side Calculation (Quick Hack, Not Recommended)

Sum up unpaid transactions on client. **Don't do this** - violates server-authoritative principle.

## Shared Limit Cards

If two cards share a limit, the Usage shown should be the **combined unpaid usage across both cards**.

### Enhancement: Detect Shared Limits

**Update**: `packages/shared/src/domain/cardDetail.ts`

```typescript
/**
 * Compute usage considering shared limits
 */
export function computeCardDetailWithSharedLimits(
  input: CardDetailInput,
  allCards: Array<{ id: string; shared_limit_with: string | null }>
): CardDetailResult {
  const card = allCards.find(c => c.id === input.cardId);
  
  // Find all cards in this shared limit group
  const sharedLimitCards = card?.shared_limit_with
    ? allCards.filter(c => 
        c.id === input.cardId || 
        c.id === card.shared_limit_with || 
        c.shared_limit_with === input.cardId
      )
    : [{ id: input.cardId }];
  
  // Compute usage across all shared limit cards
  let totalCardUsage = 0;
  for (const sharedCard of sharedLimitCards) {
    const cardTxns = input.transactions.filter(t => t.card_id === sharedCard.id);
    for (const t of cardTxns) {
      if (!t.is_paid) {
        if (t.type === 'spend') totalCardUsage += money(t.amount);
        else if (t.type === 'refund') totalCardUsage -= money(t.amount);
      }
    }
  }
  
  // ... rest of computation ...
  
  return {
    // ...
    totalCardUsage: roundMoney(totalCardUsage),
  };
}
```

**Update Server Route**: `packages/server/src/routes/summary.ts`

```typescript
// When fetching card detail, also fetch shared limit cards
const card = await db.select().from(cards).where(eq(cards.id, cardId));
const allUserCards = await db.select().from(cards).where(eq(cards.user_id, card.user_id));

const detail = computeCardDetailWithSharedLimits(input, allUserCards);
```

## Testing

### Test Cases

1. **Single card, single holder**: Usage = unpaid amount
2. **Single card, multiple holders**: Usage = sum of all unpaid
3. **Shared limit cards**: Usage = combined unpaid across both cards
4. **Card with refunds**: Usage correctly subtracts refunds
5. **Card with card payments**: Card payments DO NOT reduce usage (they reduce toCollect)

### Expected Output for FlipkartAxis

After fix:
```
Usage: ₹58,736  (was ₹53,736)
To Collect: ₹58,117  (unchanged)
```

If "Me" holder has additional unpaid transactions, usage should exceed toCollect.

## Migration

No schema changes needed - this is just a calculation fix.

## Estimated Effort

- **Shared package update**: 2 hours
- **Server route update**: 1 hour
- **Android DTO + ViewModel**: 1 hour
- **Android UI update**: 1 hour
- **Testing**: 2 hours

**Total**: ~1 day (Quick win!)
