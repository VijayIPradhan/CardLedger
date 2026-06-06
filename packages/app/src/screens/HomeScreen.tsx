import { useEffect, useRef } from 'react';
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
import { useUiStore } from '../store/uiStore.js';
import { scheduleDueReminders } from '../lib/notifications.js';
import {
  getCycleRange,
  getCardUtilization,
  getTotalUtilization,
  getUpcomingDues,
} from '@cardledger/shared';
import type { Card, Holder, Transaction, Assignment } from '@cardledger/shared';

const todayISO = () => new Date().toISOString().split('T')[0];

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
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

  // Horizontal carousel scroll handling
  const scrollRef = useRef<HTMLDivElement>(null);

  // Update the active index (for dots + reminders) based on which card is centered
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const child = c as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    if (nearest !== activeCardIndex) setActiveCardIndex(nearest);
  }

  function scrollToCard(i: number) {
    const child = scrollRef.current?.children[i] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  // current-cycle spend per card
  const spendByCard: Record<string, number> = {};
  for (const card of cardList) {
    const { start, end } = getCycleRange(card.billing_cycle_day, today);
    spendByCard[card.id] = (transactions as Transaction[])
      .filter((t) => t.card_id === card.id && t.txn_date >= start && t.txn_date <= end)
      .reduce((s, t) => s + Number(t.amount), 0);
  }

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

      {/* Portfolio summary */}
      {cardList.length > 0 && (
        <div className="px-4 mb-5">
          <div className="bg-surface rounded-card p-5 flex items-center gap-5">
            <div className="relative flex items-center justify-center">
              <SpendRing spent={total.spend} limit={total.limit} size={72} />
              <span className="absolute text-sm font-semibold">{total.percent}%</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted">Total utilization</p>
              <p className="text-lg font-semibold">
                ₹{total.spend.toLocaleString('en-IN')}{' '}
                <span className="text-muted text-sm font-normal">
                  / ₹{total.limit.toLocaleString('en-IN')}
                </span>
              </p>
            </div>
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

      {/* Card carousel — horizontal snap scroll, every card reachable by swiping */}
      {cardList.length > 0 && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 px-4 pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {cardList.map((card) => {
            const util = getCardUtilization(Number(card.credit_limit), spendByCard[card.id] ?? 0);
            return (
              <div key={card.id} className="snap-center shrink-0 w-[85%]">
                <div onClick={() => nav(`/cards/${card.id}`)}>
                  <CardTile
                    card={card}
                    holder={getCardHolder(card.id)}
                    cycleSpend={spendByCard[card.id] ?? 0}
                  />
                </div>
                <p className="text-center text-xs text-muted mt-2">{util.percent}% utilized</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Dot indicators */}
      {cardList.length > 1 && (
        <div className="flex justify-center gap-1.5 mb-5">
          {cardList.map((c, i) => (
            <button
              key={c.id}
              onClick={() => scrollToCard(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === activeCardIndex ? 'w-5 bg-gold' : 'w-1.5 bg-elevated'
              }`}
            />
          ))}
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
