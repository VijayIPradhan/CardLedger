import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  label?: string;
  error?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function PinPad({ length = 6, onComplete, label = 'Enter PIN', error }: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([]);

  function press(key: string) {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === '') return;
    const next = [...digits, key];
    setDigits(next);
    if (next.length === length) {
      onComplete(next.join(''));
      setDigits([]);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <p className="text-lg font-medium text-muted">{label}</p>
      <div className="flex gap-4">
        {Array.from({ length }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-3 h-3 rounded-full ${i < digits.length ? 'bg-gold' : 'bg-elevated'}`}
            animate={{ scale: i < digits.length ? 1.2 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
        ))}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            className="text-sm text-danger"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-3 gap-3 w-64">
        {KEYS.map((k, i) => (
          <button
            key={i}
            onClick={() => press(k)}
            disabled={k === ''}
            className={`h-16 rounded-input text-xl font-medium transition-colors ${
              k === ''
                ? 'invisible'
                : 'bg-surface hover:bg-elevated active:bg-elevated/80 text-white'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
