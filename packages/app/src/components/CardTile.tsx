import { motion } from 'framer-motion';
import type { Card, Holder } from '@cardledger/shared';
import { getDaysUntilDue } from '@cardledger/shared';
import { SpendRing } from './SpendRing.js';
import { DueDateChip } from './DueDateChip.js';
import { HolderBadge } from './HolderBadge.js';
import { networkLogo } from '../lib/networkLogo.js';

const NETWORK_COLORS: Record<string, string> = {
  Visa: 'from-[#1a237e] to-[#283593]',
  Mastercard: 'from-[#b71c1c] to-[#c62828]',
  RuPay: 'from-[#1b5e20] to-[#2e7d32]',
  Amex: 'from-[#006064] to-[#00838f]',
};

const VARIANT_COLORS: Record<string, string> = {
  Coral: 'from-[#FF7F50] to-[#E25822]',
  Sapphire: 'from-[#0f52ba] to-[#000080]',
  Rubyx: 'from-[#E0115F] to-[#900020]',
  Emeralde: 'from-[#50C878] to-[#006400]',
  Infinia: 'from-[#1a1a1a] to-[#000000]',
  'Diners Club Black': 'from-[#2C3E50] to-[#000000]',
  Regalia: 'from-[#b8860b] to-[#8b6508]',
  Millennia: 'from-[#000080] to-[#0000cd]',
  SimplyCLICK: 'from-[#20b2aa] to-[#008080]',
  SimplySAVE: 'from-[#3cb371] to-[#2e8b57]',
  'Flipkart Axis': 'from-[#2874f0] to-[#004dc0]',
  Ace: 'from-[#1a1a1a] to-[#000000]',
  'Amazon Pay ICICI': 'from-[#333333] to-[#000000]',
};

interface CardTileProps {
  card: Card;
  holder?: Holder;
  cycleSpend: number;
  limitRank?: number;
  onClick?: () => void;
}

export function CardTile({ card, holder, cycleSpend, limitRank, onClick }: CardTileProps) {
  let gradient = 'from-elevated to-surface';
  if (card.variant && VARIANT_COLORS[card.variant]) {
    gradient = VARIANT_COLORS[card.variant];
  } else if (NETWORK_COLORS[card.network]) {
    gradient = NETWORK_COLORS[card.network];
  }
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
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60 mb-1">{card.bank}</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold truncate">{card.nickname}</p>
              {holder && <HolderBadge holder={holder} />}
            </div>
            {card.variant && <p className="text-xs text-white/60 mt-0.5">{card.variant}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <img
              src={networkLogo(card.network)}
              alt={card.network}
              className="h-6 w-auto object-contain"
            />
            <div className="flex gap-1.5 items-center">
              {limitRank !== undefined && (
                <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/30 backdrop-blur-sm">
                  #{limitRank}
                </span>
              )}
              {(() => {
                const limit = Number(card.credit_limit || 0);
                const pct = limit > 0 ? Math.round((cycleSpend / limit) * 100) : 0;
                const isSafe = pct < 30;
                const isWarn = pct >= 30 && pct <= 50;
                return (
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-md border ${
                      isSafe
                        ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400/40'
                        : isWarn
                          ? 'bg-amber-500/30 text-amber-300 border-amber-400/40'
                          : 'bg-rose-500/30 text-rose-300 border-rose-400/40'
                    }`}
                  >
                    {isSafe ? '⚡ <30%' : isWarn ? '⚠️ 30-50%' : '🚨 >50%'}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-white/60 mb-1">•••• {card.last4}</p>
            <DueDateChip daysLeft={daysLeft} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <SpendRing
              spent={cycleSpend}
              limit={Number(card.credit_limit)}
              percentText={`${Number(card.credit_limit) > 0 ? Math.round((cycleSpend / Number(card.credit_limit)) * 100) : 0}%`}
            />
            <p className="text-[10px] text-white/60">₹{cycleSpend.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
