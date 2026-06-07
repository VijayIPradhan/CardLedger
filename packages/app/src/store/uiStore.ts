import { create } from 'zustand';

interface UiState {
  activeCardIndex: number;
  setActiveCardIndex: (i: number) => void;
  openSheet: string | null;
  openBottomSheet: (id: string) => void;
  closeBottomSheet: () => void;
  addTxnCardId: string | null;
  setAddTxnCardId: (id: string | null) => void;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeCardIndex: 0,
  setActiveCardIndex: (i) => set({ activeCardIndex: i }),
  openSheet: null,
  openBottomSheet: (id) => set({ openSheet: id }),
  closeBottomSheet: () => set({ openSheet: null }),
  addTxnCardId: null,
  setAddTxnCardId: (id) => set({ addTxnCardId: id }),
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
