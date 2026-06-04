// packages/app/src/store/reviewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParseResult } from '@cardledger/shared';

export interface ReviewItem {
  id: string;
  parseResult: ParseResult;
  /**
   * Auto-matched card ID by last4 at enqueue time.
   * undefined = no card with that last4 found — user must pick from dropdown in ReviewQueueScreen.
   */
  cardId?: string;
}

interface ReviewState {
  queue: ReviewItem[];
  /** Hashes of all processed messages (auto-committed + queued) — used for deduplication. */
  knownHashes: string[];
  enqueue: (item: ReviewItem) => void;
  /** Record a hash as processed without adding to the review queue (used after auto-commit). */
  addHash: (hash: string) => void;
  /** Remove item from queue after user confirms or dismisses. */
  remove: (id: string) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      queue: [],
      knownHashes: [],
      enqueue: (item) =>
        set((s) => ({
          queue: [...s.queue, item],
          knownHashes: [...s.knownHashes, item.parseResult.dedupeHash],
        })),
      addHash: (hash) => set((s) => ({ knownHashes: [...s.knownHashes, hash] })),
      remove: (id) => set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
    }),
    { name: 'cl_review_store' },
  ),
);
