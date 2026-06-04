// packages/app/src/store/reviewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useReviewStore = create()(persist((set) => ({
    queue: [],
    knownHashes: [],
    enqueue: (item) => set((s) => ({
        queue: [...s.queue, item],
        knownHashes: [...s.knownHashes, item.parseResult.dedupeHash],
    })),
    addHash: (hash) => set((s) => ({ knownHashes: [...s.knownHashes, hash] })),
    remove: (id) => set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
}), { name: 'cl_review_store' }));
