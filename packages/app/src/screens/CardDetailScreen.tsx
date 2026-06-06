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
import { useTransactions, useDeleteTransaction } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction, Holder, Assignment } from '@cardledger/shared';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: card } = useCard(id!);
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments(id);
  const { data: transactions = [] } = useTransactions({ card_id: id });
  const deleteCard = useDeleteCard();
  const deleteTxn = useDeleteTransaction();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState('');

  if (!card) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>
      </Screen>
    );
  }

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));

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
  const cycleSpend = cycles[cycles.length - 1]?.txns.reduce((s, t) => s + Number(t.amount), 0) ?? 0;

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
    await deleteTxn.mutateAsync(selectedTxn.id);
    setSelectedTxn(null);
    closeBottomSheet();
  }

  function openTxnActions(t: Transaction) {
    setSelectedTxn(t);
    openBottomSheet('txn-actions');
  }

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-4">
        <CardTile card={card} holder={currentHolder} cycleSpend={cycleSpend} />
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

      <BottomSheet id="txn-actions" title={selectedTxn?.merchant ?? 'Transaction'}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            ₹{selectedTxn ? Number(selectedTxn.amount).toLocaleString('en-IN') : ''} ·{' '}
            {selectedTxn?.txn_date}
          </p>
          <button
            onClick={handleDeleteTxn}
            className="w-full bg-elevated py-3 rounded-input text-sm text-danger mt-2"
          >
            Delete transaction
          </button>
          <button
            onClick={closeBottomSheet}
            className="w-full bg-elevated py-3 rounded-input text-sm text-muted"
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
