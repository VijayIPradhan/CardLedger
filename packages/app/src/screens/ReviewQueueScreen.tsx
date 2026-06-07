// packages/app/src/screens/ReviewQueueScreen.tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useReviewStore, type ReviewItem } from '../store/reviewStore.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import { useCards } from '../data/hooks/useCards.js';
import type { Card } from '@cardledger/shared';

export default function ReviewQueueScreen() {
  const { queue, remove } = useReviewStore();
  const createTxn = useCreateTransaction();
  const { data: cards = [] } = useCards();

  if (queue.length === 0) {
    return (
      <Screen className="pb-24">
        <TopBar title="Review Queue" />
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted">
          <span className="text-4xl">✓</span>
          <p className="text-sm">All caught up</p>
        </div>
        <BottomNav />
      </Screen>
    );
  }

  return (
    <Screen className="pb-24">
      <TopBar title={`Review Queue (${queue.length})`} />
      <div className="px-4 flex flex-col gap-3 pt-4">
        <AnimatePresence>
          {queue.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              cards={cards as Card[]}
              onConfirm={async (cardId, amount, merchant, date) => {
                await createTxn.mutateAsync({
                  card_id: cardId,
                  amount,
                  merchant,
                  txn_date: date,
                  source: 'sms',
                  type: item.parseResult.type,
                  is_paid: item.parseResult.is_paid ?? false,
                  dedupe_hash: item.parseResult.dedupeHash,
                  raw_sms_encrypted: null,
                });
                remove(item.id);
              }}
              onDismiss={() => remove(item.id)}
            />
          ))}
        </AnimatePresence>
      </div>
      <BottomNav />
    </Screen>
  );
}

// ─── ReviewCard sub-component ────────────────────────────────────────────────

interface ReviewCardProps {
  item: ReviewItem;
  cards: Card[];
  onConfirm: (cardId: string, amount: number, merchant: string, date: string) => Promise<void>;
  onDismiss: () => void;
}

function ReviewCard({ item, cards, onConfirm, onDismiss }: ReviewCardProps) {
  const pr = item.parseResult;
  const [amount, setAmount] = useState(String(pr.amount));
  const [merchant, setMerchant] = useState(pr.merchant);
  const [date, setDate] = useState(pr.date);
  const [cardId, setCardId] = useState(item.cardId ?? '');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!cardId) return;
    setSaving(true);
    try {
      await onConfirm(cardId, parseFloat(amount), merchant, date);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-3 py-2 text-sm focus:border-gold outline-none';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="bg-surface rounded-card p-4 flex flex-col gap-3"
    >
      {/* Raw SMS snippet */}
      <p className="text-xs text-muted font-mono leading-relaxed line-clamp-3">{pr.raw.body}</p>
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted">
          Bank: <span className="text-white">{pr.bank}</span>
          {pr.last4 && (
            <>
              {' '}
              · last4: <span className="text-white">{pr.last4}</span>
            </>
          )}
        </p>
        {pr.type === 'payment' && (
          <span className="bg-success/20 text-success text-[10px] uppercase font-bold px-2 py-0.5 rounded">
            Payment
          </span>
        )}
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Amount (₹)</label>
          <input
            type="number"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Date</label>
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Merchant</label>
        <input
          type="text"
          className={inputCls}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Card</label>
        <select className={inputCls} value={cardId} onChange={(e) => setCardId(e.target.value)}>
          <option value="">— Select card —</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname} ···{c.last4}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleConfirm}
          disabled={saving || !cardId}
          className="flex-1 bg-gold font-semibold py-2 rounded-input text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 bg-elevated py-2 rounded-input text-sm text-muted"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
