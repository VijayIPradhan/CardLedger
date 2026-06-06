import { useState } from 'react';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BottomSheet } from '../components/BottomSheet.js';
import { HolderForm } from '../components/HolderForm.js';
import {
  useHolders,
  useCreateHolder,
  useUpdateHolder,
  useDeleteHolder,
} from '../data/hooks/useHolders.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import type { Holder, Card, Transaction } from '@cardledger/shared';

export default function HolderViewScreen() {
  const { data: holders = [] } = useHolders();
  const { data: cards = [] } = useCards();
  const { data: transactions = [] } = useTransactions();
  const createHolder = useCreateHolder();
  const updateHolder = useUpdateHolder();
  const deleteHolder = useDeleteHolder();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [editing, setEditing] = useState<Holder | null>(null);
  const [error, setError] = useState('');

  const cardMap = Object.fromEntries(cards.map((c: Card) => [c.id, c]));
  const friends = holders.filter((h: Holder) => h.relationship === 'friend');

  function getTotal(holder: Holder) {
    return transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .reduce((s: number, t: Transaction) => s + Number(t.amount), 0);
  }

  function getBreakdown(holder: Holder) {
    const byCard: Record<string, number> = {};
    transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .forEach((t: Transaction) => {
        byCard[t.card_id] = (byCard[t.card_id] ?? 0) + Number(t.amount);
      });
    return Object.entries(byCard)
      .map(([cardId, amount]) => ({ card: cardMap[cardId] as Card | undefined, amount }))
      .filter((x): x is { card: Card; amount: number } => !!x.card);
  }

  function openAdd() {
    setEditing(null);
    setError('');
    openBottomSheet('holder-form');
  }

  function openEdit(h: Holder) {
    setEditing(h);
    setError('');
    openBottomSheet('holder-form');
  }

  async function handleSubmit(data: { name: string; phone: string; relationship: 'friend' }) {
    if (editing) {
      await updateHolder.mutateAsync({ id: editing.id, ...data });
    } else {
      await createHolder.mutateAsync(data);
    }
    closeBottomSheet();
  }

  async function handleDelete(h: Holder) {
    setError('');
    try {
      await deleteHolder.mutateAsync(h.id);
    } catch {
      setError(`Can't delete ${h.name} — they have transactions or assignments.`);
    }
  }

  return (
    <Screen className="pb-24">
      <TopBar title="Holders" />
      <div className="px-4 flex flex-col gap-4">
        <button
          onClick={openAdd}
          className="w-full bg-surface border border-elevated rounded-card py-3 text-sm text-gold font-semibold"
        >
          + Add friend
        </button>

        {error && <p className="text-danger text-xs text-center">{error}</p>}

        {friends.length === 0 && (
          <p className="text-muted text-sm text-center py-16">No friends added yet</p>
        )}

        {friends.map((holder: Holder, i: number) => {
          const total = getTotal(holder);
          const breakdown = getBreakdown(holder);
          const initials = holder.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
          return (
            <motion.div
              key={holder.id}
              className="bg-surface rounded-card p-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25, delay: i * 0.05 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{holder.name}</p>
                  <p className="text-xs text-muted">{holder.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="font-semibold text-gold">₹{total.toLocaleString('en-IN')}</p>
                </div>
              </div>
              {breakdown.map(({ card, amount }) => (
                <div
                  key={card.id}
                  className="flex justify-between items-center py-2 border-t border-elevated/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-elevated px-2 py-0.5 rounded-chip text-muted">
                      {card.network}
                    </span>
                    <span className="text-sm">•••• {card.last4}</span>
                  </div>
                  <span className="text-sm text-danger">−₹{amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => openEdit(holder)}
                  className="flex-1 bg-elevated py-2 rounded-input text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(holder)}
                  className="flex-1 bg-elevated py-2 rounded-input text-xs text-danger"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <BottomSheet id="holder-form" title={editing ? 'Edit friend' : 'Add friend'}>
        <HolderForm
          initial={editing ?? undefined}
          submitting={createHolder.isPending || updateHolder.isPending}
          onSubmit={handleSubmit}
          onCancel={closeBottomSheet}
        />
      </BottomSheet>

      <BottomNav />
    </Screen>
  );
}
