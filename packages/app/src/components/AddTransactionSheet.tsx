import { useMemo, useState, useEffect } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { useUiStore } from '../store/uiStore.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import type { Card, Holder, Assignment } from '@cardledger/shared';

const todayISO = () => new Date().toISOString().split('T')[0];

export function AddTransactionSheet() {
  const { openSheet, closeBottomSheet, addTxnCardId } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const createTxn = useCreateTransaction();

  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<'spend' | 'payment'>('spend');
  const [holderId, setHolderId] = useState('');
  const [error, setError] = useState('');

  const meHolder = (holders as Holder[]).find((h) => h.relationship === 'me');

  // Default "who used" = active assignment holder for the chosen card, else "me"
  const resolvedHolderId = useMemo(() => {
    const active = (assignments as Assignment[]).find(
      (a) => a.card_id === cardId && !a.returned_date,
    );
    return active?.holder_id ?? meHolder?.id ?? '';
  }, [cardId, assignments, meHolder]);

  // When the sheet opens, seed card + reset fields
  useEffect(() => {
    if (openSheet === 'add-txn') {
      const initialCard = addTxnCardId ?? (cards as Card[])[0]?.id ?? '';
      setCardId(initialCard);
      setAmount('');
      setMerchant('');
      setDate(todayISO());
      setType('spend');
      setError('');
    }
  }, [openSheet, addTxnCardId]); // intentional: cards list should not re-seed on every render

  // Keep who-used in sync with the selected card until the user overrides it
  useEffect(() => {
    if (type === 'payment') {
      setHolderId(meHolder?.id ?? '');
    } else {
      setHolderId(resolvedHolderId);
    }
  }, [resolvedHolderId, type, meHolder]);

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-4 py-3 text-sm focus:border-gold outline-none';

  async function handleSubmit() {
    setError('');
    const amt = parseFloat(amount);
    if (!cardId) return setError('Pick a card');
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (!merchant.trim()) return setError('Enter a merchant');
    if (!holderId) return setError('Pick who used the card');
    try {
      await createTxn.mutateAsync({
        card_id: cardId,
        amount: amt,
        merchant: merchant.trim(),
        txn_date: date,
        source: 'manual',
        type: type,
        is_paid: type === 'payment',
        holder_id_at_time: holderId,
        raw_sms_encrypted: null,
        dedupe_hash: null,
      });
      closeBottomSheet();
    } catch {
      setError('Could not save transaction');
    }
  }

  return (
    <BottomSheet id="add-txn" title="Add transaction">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Card</label>
          <select className={inputCls} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">— Select card —</option>
            {(cards as Card[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname} ···{c.last4}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
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
          <label className="text-xs text-muted">Type</label>
          <div className="flex bg-elevated rounded-input p-1">
            <button
              className={`flex-1 py-2 text-sm rounded transition-colors ${type === 'spend' ? 'bg-surface text-white shadow' : 'text-muted'}`}
              onClick={() => setType('spend')}
            >
              Spend
            </button>
            <button
              className={`flex-1 py-2 text-sm rounded transition-colors ${type === 'payment' ? 'bg-surface text-success shadow' : 'text-muted'}`}
              onClick={() => setType('payment')}
            >
              Payment
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Merchant</label>
          <input
            className={inputCls}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">
            {type === 'payment' ? 'Who paid' : 'Who used'}
          </label>
          <select
            className={inputCls}
            value={holderId}
            onChange={(e) => setHolderId(e.target.value)}
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

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSubmit}
            disabled={createTxn.isPending}
            className="flex-1 bg-gold font-semibold py-3 rounded-input text-sm disabled:opacity-50"
          >
            {createTxn.isPending ? 'Saving…' : 'Add transaction'}
          </button>
          <button
            onClick={closeBottomSheet}
            className="flex-1 bg-elevated py-3 rounded-input text-sm text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
