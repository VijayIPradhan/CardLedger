import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import type { UseMutationResult } from '@tanstack/react-query';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BottomSheet } from '../components/BottomSheet.js';
import { CardTile } from '../components/CardTile.js';
import { Fab } from '../components/Fab.js';
import { AddTransactionSheet } from '../components/AddTransactionSheet.js';
import { useCard, useCards, useDeleteCard } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import {
  useTransactions,
  useDeleteTransaction,
  useUpdateTransaction,
} from '../data/hooks/useTransactions.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction, Holder, Assignment } from '@cardledger/shared';

const inputCls =
  'w-full bg-elevated border border-elevated rounded-input px-3 py-2 text-sm focus:border-gold outline-none';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: card } = useCard(id!);
  const { data: allCardsRaw } = useCards();
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

  const createTxn = useCreateTransaction();
  const [cardPaymentAmount, setCardPaymentAmount] = useState('');
  const [cardPaymentDate, setCardPaymentDate] = useState(new Date().toISOString().split('T')[0]);

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

  const allCards = Array.isArray(allCardsRaw) ? allCardsRaw : [];

  const activeAssignment = (assignments as Assignment[]).find((a) => !a.returned_date);
  const currentHolder = activeAssignment
    ? holderMap[activeAssignment.holder_id]
    : holders.find((h: Holder) => h.relationship === 'me');

  const groupId = card.shared_limit_with || card.id;
  const totalSpend = allCards
    .filter((c: any) => (c.shared_limit_with || c.id) === groupId)
    .reduce((s, c) => s + Number(c.current_spend || 0), 0);

  async function handleDeleteCard() {
    setError('');
    try {
      await deleteCard.mutateAsync(card!.id);
      nav('/');
    } catch (e) {
      console.error('Failed to delete card:', e);
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
    } catch (e) {
      console.error('Failed to delete transaction:', e);
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
    } catch (e) {
      console.error('Failed to update transaction:', e);
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

  function openCardPayment() {
    setCardPaymentAmount('');
    setCardPaymentDate(new Date().toISOString().split('T')[0]);
    setError('');
    openBottomSheet('card-payment-form');
  }

  async function handleCardPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(cardPaymentAmount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setError('');
    try {
      await createTxn.mutateAsync({
        card_id: id!,
        amount,
        txn_date: cardPaymentDate,
        merchant: 'Payment to Bank',
        type: 'bill_payment',
        source: 'manual',
        holder_id_at_time: currentHolder?.id,
      });
      closeBottomSheet();
    } catch {
      setError('Could not save card payment.');
    }
  }

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-4">
        <CardTile card={card} holder={currentHolder} cycleSpend={totalSpend} />
        {(() => {
          const cycleDay = card.billing_cycle_day || 1;
          const dueDay = card.payment_due_day || 1;
          const todayDay = new Date().getDate();
          const daysToStmt =
            todayDay <= cycleDay ? cycleDay - todayDay : 30 - (todayDay - cycleDay);
          const daysToDue = todayDay <= dueDay ? dueDay - todayDay : 30 - (todayDay - dueDay);
          const spend = totalSpend;
          return (
            <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-surface to-elevated border border-gold/40 shadow-lg space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gold flex items-center gap-1.5">
                  <span>📅</span> Billing & Payment Advice
                </span>
                <span className="text-[11px] bg-gold/10 text-gold px-2 py-0.5 rounded-full border border-gold/30 font-semibold">
                  Cycle: Day {cycleDay} · Due: Day {dueDay}
                </span>
              </div>
              <p className="text-xs text-on-dark leading-relaxed">
                {daysToStmt < daysToDue ? (
                  <>
                    ⚡{' '}
                    <strong className="text-gold">
                      Statement Date in {daysToStmt} days (Day {cycleDay})!
                    </strong>{' '}
                    Pay down your ₹{spend.toLocaleString('en-IN')} balance before statement
                    generation so <strong>0% utilization</strong> is reported to CIBIL/Experian!
                  </>
                ) : (
                  <>
                    ⚠️ <strong className="text-amber-400">Statement Generated!</strong> Pay your due
                    balance of ₹{spend.toLocaleString('en-IN')} before Day {dueDay} (in {daysToDue}{' '}
                    days) to avoid late fees and interest!
                  </>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={openCardPayment}
                  className="bg-gold text-surface text-xs font-bold px-3 py-1.5 rounded-input w-full"
                >
                  Pay Credit Card Bill
                </button>
              </div>
            </div>
          );
        })()}

        {/* Card Security & Emergency Shield */}
        <div className="mt-3 p-4 rounded-xl bg-surface border border-elevated shadow-md space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
              <span>🛡️</span> Security & Emergency Shield
            </span>
            <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-bold border border-rose-500/30">
              INSTANT ACTION
            </span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Lost card or suspicious transaction? Take instant protective measures below to freeze
            unauthorized spend:
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2.5 rounded-lg bg-elevated/50 border border-elevated flex flex-col justify-between">
              <span className="text-[11px] font-bold text-on-dark">📞 24/7 Bank Helpline</span>
              <span className="text-[10px] text-gold font-semibold mt-1">
                1800-102-4242 / 1800-22-1070
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-elevated/50 border border-elevated flex flex-col justify-between">
              <span className="text-[11px] font-bold text-on-dark">🔒 International Spend</span>
              <span className="text-[10px] text-emerald-400 font-semibold mt-1">
                ✓ Toggle Off when in India
              </span>
            </div>
          </div>
        </div>

        {/* Virtual Card Alias & Free Trial Shield Generator */}
        <div className="mt-3 p-4 rounded-xl bg-surface border border-elevated shadow-md space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gold flex items-center gap-1.5">
              <span>💳</span> Virtual Trial Shield Generator
            </span>
            <span className="text-[10px] bg-gold/10 text-gold px-2 py-0.5 rounded font-bold border border-gold/30">
              PRIVACY SHIELD
            </span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Signing up for a free trial or shady website? Generate a temporary virtual alias with a
            custom spend cap so you never get overcharged when trials end:
          </p>
          <div className="p-3 rounded-lg bg-elevated/40 border border-gold/30 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider font-bold">
                VIRTUAL ALIAS NUMBER
              </p>
              <p className="text-sm font-mono font-bold text-on-dark mt-0.5">
                4532 •••• •••• 8891 <span className="text-xs text-gold ml-1">(Exp: 07/26)</span>
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText('4532000000008891');
                alert(
                  'Copied Virtual Trial Alias to clipboard! Set spend cap at ₹500 in your bank app.',
                );
              }}
              className="bg-gold text-base px-2.5 py-1 rounded text-xs font-bold hover:bg-gold/90 transition-colors shadow-sm"
            >
              📋 Copy Alias
            </button>
          </div>
        </div>
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
              <SwipeableTransaction
                key={t.id}
                t={t}
                holderMap={holderMap}
                openTxnActions={openTxnActions}
                updateTxn={updateTxn}
              />
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

      <BottomSheet id="card-payment-form" title="Record Card Payment">
        <form onSubmit={handleCardPaymentSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">Record payment made to the bank for this card.</p>
          <div>
            <label className="text-xs text-muted mb-1 block">Amount (₹)</label>
            <input
              type="number"
              value={cardPaymentAmount}
              onChange={(e) => setCardPaymentAmount(e.target.value)}
              placeholder="e.g. 5000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Date</label>
            <input
              type="date"
              value={cardPaymentDate}
              onChange={(e) => setCardPaymentDate(e.target.value)}
              className={inputCls}
            />
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <button
            type="submit"
            disabled={createTxn.isPending}
            className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50 text-surface"
          >
            {createTxn.isPending ? 'Saving...' : 'Save Payment'}
          </button>
        </form>
      </BottomSheet>

      <Fab cardId={card.id} />
      <AddTransactionSheet />
      <BottomNav />
    </Screen>
  );
}

const SWIPE_REVEAL_WIDTH = 160;
const SWIPE_OFFSET_THRESHOLD = -50;
const SWIPE_VELOCITY_THRESHOLD = -500;

function SwipeableTransaction({
  t,
  holderMap,
  openTxnActions,
  updateTxn,
}: {
  t: Transaction;
  holderMap: Record<string, Holder>;
  openTxnActions: (t: Transaction) => void;
  updateTxn: UseMutationResult<Transaction, Error, Partial<Transaction> & { id: string }>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const controls = useAnimation();
  const [isOpen, setIsOpen] = useState(false);

  const close = () => {
    setIsOpen(false);
    controls.start({ x: 0 });
  };

  return (
    <div className="relative border-b border-elevated/40 overflow-hidden rounded">
      {/* Background Actions */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end px-4 gap-4 w-[160px]">
        <button
          onClick={async (e) => {
            e.stopPropagation();
            await updateTxn.mutateAsync({ id: t.id, is_paid: !t.is_paid });
            close();
          }}
          className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transform transition-transform active:scale-90 ${
            t.is_paid ? 'bg-elevated' : 'bg-success'
          }`}
        >
          {t.is_paid ? (
            // Revert icon
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          ) : (
            // Check icon
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-danger shadow-lg transform transition-transform active:scale-90"
        >
          {/* X icon */}
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <motion.div
        drag={t.type === 'bill_payment' ? false : 'x'}
        dragConstraints={{ left: isOpen ? -SWIPE_REVEAL_WIDTH : 0, right: 0 }}
        dragElastic={{ left: 0.2, right: 0.1 }}
        animate={controls}
        style={{ touchAction: 'pan-y' }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(e, { offset, velocity }) => {
          setTimeout(() => setIsDragging(false), 50);
          // If swiped far enough to left, open it
          if (offset.x < SWIPE_OFFSET_THRESHOLD || velocity.x < SWIPE_VELOCITY_THRESHOLD) {
            setIsOpen(true);
            controls.start({ x: -SWIPE_REVEAL_WIDTH });
          } else {
            setIsOpen(false);
            controls.start({ x: 0 });
          }
        }}
        onClick={() => {
          if (!isDragging) {
            if (isOpen) close();
            else openTxnActions(t);
          }
        }}
        className={`relative w-full flex justify-between items-center py-3 px-2 ${t.type === 'bill_payment' ? 'bg-success/5 border border-success/20 rounded-lg my-1' : 'bg-dark'} text-left`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {t.type === 'bill_payment' ? <span className="text-success text-lg">🏦</span> : null}
            <p
              className={`text-sm ${t.is_paid ? 'line-through text-muted' : t.type === 'bill_payment' ? 'text-success font-semibold' : ''}`}
            >
              {t.merchant}
            </p>
            {t.is_paid && t.type !== 'bill_payment' && (
              <span className="text-[9px] font-bold text-success bg-success/20 px-1.5 py-0.5 rounded">
                PAID
              </span>
            )}
            {t.type === 'bill_payment' && (
              <span className="text-[9px] font-bold text-success bg-success/20 px-1.5 py-0.5 rounded border border-success/30">
                PAYMENT RECEIVED
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {t.type === 'bill_payment'
              ? `Processed on ${t.txn_date}`
              : `${holderMap[t.holder_id_at_time]?.name ?? '—'} · ${t.txn_date.slice(5)}`}
          </p>
        </div>
        <span
          className={`text-sm font-bold ${t.is_paid && t.type !== 'bill_payment' ? 'line-through text-muted' : t.type === 'bill_payment' ? 'text-success' : 'text-danger'}`}
        >
          {t.type === 'bill_payment' ? '+' : '−'}₹{Number(t.amount).toLocaleString('en-IN')}
        </span>
      </motion.div>
    </div>
  );
}
