import { motion } from 'framer-motion';
import type { Card, Holder } from '@cardledger/shared';
import { getDaysUntilDue } from '@cardledger/shared';
import { SpendRing } from './SpendRing.js';
import { DueDateChip } from './DueDateChip.js';
import { HolderBadge } from './HolderBadge.js';

const NETWORK_COLORS: Record<string, string> = {
  Visa: 'from-[#1a237e] to-[#283593]',
  Mastercard: 'from-[#b71c1c] to-[#c62828]',
  RuPay: 'from-[#1b5e20] to-[#2e7d32]',
  Amex: 'from-[#006064] to-[#00838f]',
};

interface CardTileProps {
  card: Card;
  holder?: Holder;
  cycleSpend: number;
  onClick?: () => void;
}

export function CardTile({ card, holder, cycleSpend, onClick }: CardTileProps) {
  const gradient = NETWORK_COLORS[card.network] ?? 'from-elevated to-surface';
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = getDaysUntilDue(card.payment_due_day, today);

  return (
    <motion.div
      onClick={onClick}
      className={`relative w-full aspect-[1.586/1] rounded-card bg-gradient-to-br ${gradient} p-6 cursor-pointer select-none`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="absolute inset-0 rounded-card bg-black/10" />
      <div className="relative flex flex-col justify-between h-full">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-white/60 mb-1">{card.bank}</p>
            <p className="text-lg font-semibold">{card.nickname}</p>
          </div>
          {holder && <HolderBadge holder={holder} />}
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-white/60 mb-1">•••• {card.last4}</p>
            <DueDateChip daysLeft={daysLeft} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <SpendRing spent={cycleSpend} limit={Number(card.credit_limit)} />
            <p className="text-[10px] text-white/60">₹{cycleSpend.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
