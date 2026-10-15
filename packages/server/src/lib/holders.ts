import { and, eq } from 'drizzle-orm';
import { resolveHolder } from '@cardledger/shared';
import { db } from '../db/index.js';
import { assignments, holders } from '../db/schema.js';

/**
 * Who had the card on `date`: the assignment covering that date, else the card's first
 * assignment, else the user's own "me" holder. Null only if the user has no "me" holder.
 */
export async function resolveCardHolder(
  userId: string,
  cardId: string,
  date: string,
): Promise<string | null> {
  const rows = await db.select().from(assignments).where(eq(assignments.card_id, cardId));
  const mapped = rows.map((a) => ({
    id: a.id,
    card_id: a.card_id,
    holder_id: a.holder_id,
    handed_over_date: String(a.handed_over_date),
    returned_date: a.returned_date ? String(a.returned_date) : null,
    created_at: String(a.created_at),
  }));
  const resolved = resolveHolder(cardId, date, mapped) ?? mapped[0]?.holder_id ?? null;
  if (resolved) return resolved;
  return (await meHolderId(userId)) ?? null;
}

export async function meHolderId(userId: string): Promise<string | undefined> {
  const [me] = await db
    .select({ id: holders.id })
    .from(holders)
    .where(and(eq(holders.relationship, 'me'), eq(holders.user_id, userId)))
    .limit(1);
  return me?.id;
}

/** True if the holder exists and belongs to the user. */
export async function ownsHolder(userId: string, holderId: string): Promise<boolean> {
  const [h] = await db
    .select({ id: holders.id })
    .from(holders)
    .where(and(eq(holders.id, holderId), eq(holders.user_id, userId)));
  return !!h;
}
