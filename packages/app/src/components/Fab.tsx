import { motion } from 'framer-motion';
import { useUiStore } from '../store/uiStore.js';

interface FabProps {
  cardId?: string; // pre-select a card when opening the add-txn sheet
}

export function Fab({ cardId }: FabProps) {
  const { openBottomSheet, setAddTxnCardId } = useUiStore();
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => {
        setAddTxnCardId(cardId ?? null);
        openBottomSheet('add-txn');
      }}
      className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-gold text-base text-2xl font-bold shadow-lg flex items-center justify-center"
      aria-label="Add transaction"
    >
      +
    </motion.button>
  );
}
