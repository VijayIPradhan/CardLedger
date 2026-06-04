import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PendingMutation {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload: unknown;
  timestamp: number;
}

interface PendingState {
  queue: PendingMutation[];
  enqueue: (m: Omit<PendingMutation, 'id' | 'timestamp'>) => void;
  dequeue: (id: string) => void;
}

export const usePendingStore = create<PendingState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (m) =>
        set((s) => ({
          queue: [
            ...s.queue,
            { ...m, id: crypto.randomUUID(), timestamp: Date.now() },
          ],
        })),
      dequeue: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
    }),
    { name: 'cl-pending-mutations' },
  ),
);
