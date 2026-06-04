import { create } from 'zustand';
export const useUiStore = create((set) => ({
    activeCardIndex: 0,
    setActiveCardIndex: (i) => set({ activeCardIndex: i }),
    openSheet: null,
    openBottomSheet: (id) => set({ openSheet: id }),
    closeBottomSheet: () => set({ openSheet: null }),
    locked: false,
    lock: () => set({ locked: true }),
    unlock: () => set({ locked: false }),
}));
