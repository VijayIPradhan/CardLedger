import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const usePendingStore = create()(persist((set) => ({
    queue: [],
    enqueue: (m) => set((s) => ({
        queue: [
            ...s.queue,
            { ...m, id: crypto.randomUUID(), timestamp: Date.now() },
        ],
    })),
    dequeue: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
}), { name: 'cl-pending-mutations' }));
