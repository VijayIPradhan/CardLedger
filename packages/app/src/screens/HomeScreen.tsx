import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { CardTile } from '../components/CardTile.js';
import { SpendRing } from '../components/SpendRing.js';
import { Fab } from '../components/Fab.js';
import { AddTransactionSheet } from '../components/AddTransactionSheet.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { usePayments } from '../data/hooks/usePayments.js';
import { useUiStore } from '../store/uiStore.js';
import { scheduleDueReminders } from '../lib/notifications.js';
import { getCardUtilization, getTotalUtilization, getUpcomingDues } from '@cardledger/shared';
import type { Card, Holder, Transaction, Assignment, Payment } from '@cardledger/shared';

const todayISO = () => new Date().toISOString().split('T')[0];

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();
  const { data: allPayments = [] } = usePayments();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const friends = holders.filter((h: Holder) => h.relationship === 'friend');
  const cardList = cards as Card[];
  const today = todayISO();

  useEffect(() => {
    if (cardList.length) {
      scheduleDueReminders(
        cardList.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          payment_due_day: c.payment_due_day,
        })),
      );
    }
    // React Query uses structural sharing, so cardList is a new reference only
    // when card data actually changes — this reschedules after edits too.
  }, [cardList]);

  // Usage = all unpaid spend per card (all-time), regardless of cycle or who used it.
  const spendByCard: Record<string, number> = {};
  for (const card of cardList) {
    spendByCard[card.id] = (transactions as Transaction[])
      .filter((t) => t.card_id === card.id)
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  // Analytics calculations
  let totalToCollect = 0;
  friends.forEach((friend: Holder) => {
    const expenses = (transactions as Transaction[])
      .filter((t) => t.holder_id_at_time === friend.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    const payments = (allPayments as Payment[])
      .filter((p) => p.holder_id === friend.id)
      .reduce((s, p) => s + Number(p.amount), 0);
    totalToCollect += expenses - payments;
  });

  const total = getTotalUtilization(
    cardList.map((c) => ({ id: c.id, credit_limit: Number(c.credit_limit) })),
    spendByCard,
  );

  const dues = getUpcomingDues(
    cardList.map((c) => ({ id: c.id, payment_due_day: c.payment_due_day })),
    today,
    7,
  );

  function getCardHolder(cardId: string): Holder | undefined {
    const active = (assignments as Assignment[]).find(
      (a) => a.card_id === cardId && !a.returned_date,
    );
    return active
      ? holderMap[active.holder_id]
      : holders.find((h: Holder) => h.relationship === 'me');
  }

  const recent = [...(transactions as Transaction[])]
    .sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))
    .slice(0, 5);

  return (
    <Screen className="pb-24">
      <TopBar
        title="CardLedger"
        action={
          <button
            onClick={() => nav('/cards/new')}
            className="w-8 h-8 rounded-full bg-elevated text-gold flex items-center justify-center text-xl leading-none"
            aria-label="Add card"
          >
            +
          </button>
        }
      />

      {/* Empty state — no cards yet */}
      {cardList.length === 0 && (
        <div className="flex flex-col items-center justify-center text-muted gap-3 px-6 py-20">
          <p className="text-4xl">◎</p>
          <p className="text-center text-sm">No cards yet. Tap + to add your first card.</p>
          <button
            onClick={() => nav('/cards/new')}
            className="mt-2 bg-gold text-base font-semibold px-6 py-3 rounded-input"
          >
            Add card
          </button>
        </div>
      )}

      {/* Analytics Dashboard */}
      {cardList.length > 0 && (
        <div className="px-4 mb-5 grid grid-cols-2 gap-3">
          <div className="bg-surface rounded-card p-4 flex flex-col gap-1 border border-elevated">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Total to Collect
            </p>
            <p className={`text-xl font-bold ${totalToCollect > 0 ? 'text-gold' : 'text-success'}`}>
              ₹{totalToCollect.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-muted leading-tight mt-1">From friends</p>
          </div>
          <div className="bg-surface rounded-card p-4 flex flex-col gap-1 border border-elevated">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Total to Pay
            </p>
            <p className={`text-xl font-bold ${total.spend > 0 ? 'text-danger' : 'text-white'}`}>
              ₹{total.spend.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-muted leading-tight mt-1">Total outstanding debt</p>
          </div>
        </div>
      )}

      {/* Upcoming dues */}
      {dues.length > 0 && (
        <div className="px-4 mb-5">
          <p className="text-xs text-muted mb-2">⚠ Upcoming dues</p>
          <div className="flex flex-col gap-2">
            {dues.map((d) => {
              const card = cardList.find((c) => c.id === d.cardId)!;
              return (
                <button
                  key={d.cardId}
                  onClick={() => nav(`/cards/${d.cardId}`)}
                  className="bg-surface rounded-card px-4 py-3 flex items-center justify-between"
                >
                  <span className="text-sm">{card.nickname}</span>
                  <span className="text-xs text-warning">
                    due {d.dueDate.slice(5)} · in {d.daysUntil}d
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Card Stack — Vertical sticky layout */}
      {cardList.length > 0 && (
        <div className="flex flex-col px-4 mb-5 relative pb-8">
          <p className="text-xs text-muted mb-3">Cards</p>
          {cardList.map((card, i) => {
            return (
              <div
                key={card.id}
                className="sticky transition-transform duration-300"
                style={{ top: `${i * 12 + 16}px`, zIndex: i }}
              >
                <div
                  onClick={() => nav(`/cards/${card.id}`)}
                  className="shadow-[0_-4px_16px_rgba(0,0,0,0.5)] rounded-card"
                >
                  <CardTile
                    card={card}
                    holder={getCardHolder(card.id)}
                    cycleSpend={spendByCard[card.id] ?? 0}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent transactions */}
      <div className="px-4">
        <p className="text-xs text-muted mb-2">Recent</p>
        {recent.length === 0 && <p className="text-muted text-sm py-4">No transactions yet</p>}
        {recent.map((t) => (
          <div
            key={t.id}
            className="flex justify-between items-center py-3 border-b border-elevated/40"
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
          </div>
        ))}
      </div>

      <Fab />
      <AddTransactionSheet />
      <BottomNav />
    </Screen>
  );
}
