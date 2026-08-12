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
import { useCreatePayment } from '../data/hooks/usePayments.js';
import { useHolderDetails } from '../data/hooks/useDashboard.js';
import { useUiStore } from '../store/uiStore.js';
import type { Holder, Card } from '@cardledger/shared';

export default function HolderViewScreen() {
  const { data: holders = [] } = useHolders();
  const { data: cards = [] } = useCards();
  // Outstanding balances and per-card breakdowns are computed server-side by the shared debt
  // engine. This screen used to do `expenses - payments`, which ignored is_paid and every
  // card payment, and so overstated what friends owed.
  const { data: holderDetails = [] } = useHolderDetails();
  const createHolder = useCreateHolder();
  const updateHolder = useUpdateHolder();
  const deleteHolder = useDeleteHolder();
  const createPayment = useCreatePayment();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [editing, setEditing] = useState<Holder | null>(null);
  const [paying, setPaying] = useState<Holder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [error, setError] = useState('');

  const cardMap = Object.fromEntries(cards.map((c: Card) => [c.id, c]));
  const friends = holders.filter((h: Holder) => h.relationship === 'friend');
  const detailById = Object.fromEntries(holderDetails.map((d) => [d.holderId, d]));

  /** Resolves the server's card ids to cards, dropping any the client hasn't loaded yet. */
  function getBreakdown(holderId: string) {
    return (detailById[holderId]?.byCard ?? [])
      .map((b) => ({ card: cardMap[b.cardId] as Card | undefined, amount: b.grossAmount }))
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

  function openPay(h: Holder) {
    setPaying(h);
    setPaymentAmount('');
    setError('');
    openBottomSheet('payment-form');
  }

  async function handleSubmit(data: { name: string; phone: string; relationship: 'friend' }) {
    setError('');
    try {
      if (editing) {
        await updateHolder.mutateAsync({ id: editing.id, ...data });
      } else {
        await createHolder.mutateAsync(data);
      }
      closeBottomSheet();
    } catch {
      setError('Could not save — check the name and phone number.');
    }
  }

  async function handleDelete(h: Holder) {
    setError('');
    try {
      await deleteHolder.mutateAsync(h.id);
    } catch {
      setError(`Can't delete ${h.name} — they have transactions or assignments.`);
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paying) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setError('');
    try {
      await createPayment.mutateAsync({
        holder_id: paying.id,
        amount,
        payment_date: new Date().toISOString().split('T')[0],
      });
      closeBottomSheet();
    } catch {
      setError('Could not save payment.');
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
          const outstanding = detailById[holder.id]?.outstanding ?? 0;
          const breakdown = getBreakdown(holder.id);
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
                  <p className="text-xs text-muted">Outstanding</p>
                  <p
                    className={`font-semibold ${outstanding > 0 ? 'text-gold' : 'text-green-500'}`}
                  >
                    ₹{outstanding.toLocaleString('en-IN')}
                  </p>
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
                  onClick={() => openPay(holder)}
                  className="flex-1 bg-gold text-surface font-semibold py-2 rounded-input text-xs"
                >
                  Record Payment
                </button>
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

      <BottomSheet id="payment-form" title="Record Payment">
        <form onSubmit={handlePaymentSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">Record money paid by {paying?.name}</p>
          <div>
            <label className="text-xs text-muted mb-1 block">Amount (₹)</label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="e.g. 1500"
              className="w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors text-white"
            />
          </div>
          <button
            type="submit"
            disabled={createPayment.isPending}
            className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
          >
            {createPayment.isPending ? 'Saving...' : 'Save Payment'}
          </button>
        </form>
      </BottomSheet>

      <BottomNav />
    </Screen>
  );
}
