import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '../store/uiStore.js';

interface BottomSheetProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ id, title, children }: BottomSheetProps) {
  const { openSheet, closeBottomSheet } = useUiStore();
  const isOpen = openSheet === id;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeBottomSheet}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-[28px] z-50 p-6 pb-10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="w-10 h-1 rounded-full bg-elevated mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-5">{title}</h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
