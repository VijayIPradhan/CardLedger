import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BottomSheet } from '../components/BottomSheet.js';
import { CardTile } from '../components/CardTile.js';
import { Fab } from '../components/Fab.js';
import { AddTransactionSheet } from '../components/AddTransactionSheet.js';
import { useCard, useDeleteCard } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import {
  useTransactions,
  useDeleteTransaction,
  useUpdateTransaction,
} from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction, Holder, Assignment } from '@cardledger/shared';

const inputCls =
  'w-full bg-elevated border border-elevated rounded-input px-3 py-2 text-sm focus:border-gold outline-none';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: card } = useCard(id!);
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments(id);
  const { data: transactions = [] } = useTransactions({ card_id: id });
  const deleteCard = useDeleteCard();
  const deleteTxn = useDeleteTransaction();
  const updateTxn = useUpdateTransaction();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editHolder, setEditHolder] = useState('');
  const [error, setError] = useState('');

  if (!card) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>
      </Screen>
    );
  }

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));

  // Transaction history grouped by the last 3 billing cycles (for the list).
  const cycles = ([-2, -1, 0] as const)
    .map((offset) => {
      const refDate = new Date();
      refDate.setMonth(refDate.getMonth() + offset);
      const ref = refDate.toISOString().split('T')[0];
      const { start, end } = getCycleRange(card.billing_cycle_day, ref);
      const txns = (transactions as Transaction[]).filter(
        (t) => t.txn_date >= start && t.txn_date <= end,
      );
      return { label: `${start} – ${end}`, txns };
    })
    .filter((c) => c.txns.length > 0);

  const activeAssignment = (assignments as Assignment[]).find((a) => !a.returned_date);
  const currentHolder = activeAssignment
    ? holderMap[activeAssignment.holder_id]
    : holders.find((h: Holder) => h.relationship === 'me');

  // Usage = all unpaid spend on the card (all-time), regardless of cycle or who used it.
  const totalSpend = (transactions as Transaction[]).reduce((s, t) => s + Number(t.amount), 0);

  async function handleDeleteCard() {
    setError('');
    try {
      await deleteCard.mutateAsync(card!.id);
      nav('/');
    } catch {
      setError('Card has transactions — delete them first.');
    }
  }

  async function handleDeleteTxn() {
    if (!selectedTxn) return;
    setError('');
    try {
      await deleteTxn.mutateAsync(selectedTxn.id);
      setSelectedTxn(null);
      closeBottomSheet();
    } catch {
      setError('Could not delete transaction.');
    }
  }

  async function handleSaveTxn() {
    if (!selectedTxn) return;
    setError('');
    const amt = parseFloat(editAmount);
    if (!amt || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!editMerchant.trim()) {
      setError('Enter a merchant');
      return;
    }
    try {
      await updateTxn.mutateAsync({
        id: selectedTxn.id,
        amount: amt,
        merchant: editMerchant.trim(),
        txn_date: editDate,
        holder_id_at_time: editHolder,
      });
      setSelectedTxn(null);
      closeBottomSheet();
    } catch {
      setError('Could not update transaction.');
    }
  }

  function openTxnActions(t: Transaction) {
    setSelectedTxn(t);
    setEditAmount(String(t.amount));
    setEditMerchant(t.merchant);
    setEditDate(t.txn_date);
    setEditHolder(t.holder_id_at_time);
    setError('');
    openBottomSheet('txn-actions');
  }

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-4">
        <CardTile card={card} holder={currentHolder} cycleSpend={totalSpend} />
      </div>

      <div className="px-4 flex gap-2 mb-4">
        <button
          onClick={() => nav(`/cards/${card.id}/edit`)}
          className="flex-1 bg-elevated py-2 rounded-input text-xs"
        >
          Edit card
        </button>
        <button
          onClick={handleDeleteCard}
          className="flex-1 bg-elevated py-2 rounded-input text-xs text-danger"
        >
          Delete card
        </button>
      </div>
      {error && <p className="px-4 text-danger text-xs mb-2">{error}</p>}

      <div className="px-4">
        {cycles.map((c) => (
          <div key={c.label}>
            <p className="text-xs text-muted mt-4 mb-1">{c.label}</p>
            {c.txns.map((t) => (
              <button
                key={t.id}
                onClick={() => openTxnActions(t)}
                className="w-full flex justify-between items-center py-3 border-b border-elevated/40 text-left"
              >
                <div>
                  <p className="text-sm">{t.merchant}</p>
                  <p className="text-xs text-muted">
                    {holderMap[t.holder_id_at_time]?.name ?? '—'} · {t.txn_date.slice(5)}
                  </p>
                </div>
                <span className="text-sm text-danger">
                  −₹{Number(t.amount).toLocaleString('en-IN')}
                </span>
              </button>
            ))}
          </div>
        ))}
        {cycles.length === 0 && (
          <p className="text-muted text-sm text-center py-8">No transactions yet</p>
        )}
      </div>

      <BottomSheet id="txn-actions" title="Edit transaction">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Amount (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Date</label>
              <input
                type="date"
                className={inputCls}
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Merchant</label>
            <input
              className={inputCls}
              value={editMerchant}
              onChange={(e) => setEditMerchant(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Who used</label>
            <select
              className={inputCls}
              value={editHolder}
              onChange={(e) => setEditHolder(e.target.value)}
            >
              {(holders as Holder[]).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.relationship === 'me' ? ' (me)' : ''}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-danger text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveTxn}
              disabled={updateTxn.isPending}
              className="flex-1 bg-gold font-semibold py-2 rounded-input text-sm disabled:opacity-50"
            >
              {updateTxn.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleDeleteTxn}
              className="flex-1 bg-elevated py-2 rounded-input text-sm text-danger"
            >
              Delete
            </button>
          </div>
          <button
            onClick={closeBottomSheet}
            className="w-full bg-elevated py-2 rounded-input text-sm text-muted"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      <Fab cardId={card.id} />
      <AddTransactionSheet />
      <BottomNav />
    </Screen>
  );
}
