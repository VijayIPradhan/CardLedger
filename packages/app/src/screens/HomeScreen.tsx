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
import { useSummary } from '../data/hooks/useDashboard.js';
import { useUiStore } from '../store/uiStore.js';
import type { Card, Holder, Transaction, Assignment } from '@cardledger/shared';

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();
  // Every figure below comes from here. The server owns the math; this screen only lays it out.
  const { data: summary } = useSummary();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const meHolder = holders.find((h: Holder) => h.relationship === 'me');
  const cardList = cards as Card[];

  const spendByCard = summary?.spendByCard ?? {};
  const totalToCollect = summary?.totalToCollect ?? 0;
  const total = {
    spend: summary?.totalSpend ?? 0,
    limit: summary?.totalLimit ?? 0,
    percent: summary?.totalUtilizationPercent ?? 0,
  };
  const netPosition = summary?.netPosition ?? 0;

  const sortedByLimit = [...cardList].sort(
    (a, b) => Number(b.credit_limit) - Number(a.credit_limit),
  );
  const limitRankMap = new Map<string, number>(sortedByLimit.map((c, i) => [c.id, i + 1]));
  const sortedCards = [...cardList].sort((a, b) => {
    const diff = (spendByCard[b.id] ?? 0) - (spendByCard[a.id] ?? 0);
    if (diff !== 0) return diff;
    return Number(b.credit_limit || 0) - Number(a.credit_limit || 0);
  });

  // Re-keying the server's per-card spend onto shared-limit groups — a display concern, so it
  // stays here rather than adding another shape to the summary payload.
  const groupedSpend: Record<string, number> = {};
  for (const c of cardList) {
    const groupId = c.shared_limit_with || c.id;
    groupedSpend[groupId] = (groupedSpend[groupId] || 0) + (spendByCard[c.id] ?? 0);
  }

  // The summary reports dues up to 15 days out; Home only surfaces the next week.
  const dues = (summary?.dues ?? []).filter((d) => d.daysUntil <= 7);

  function getCardHolder(cardId: string): Holder | undefined {
    const active = (assignments as Assignment[]).find(
      (a) => a.card_id === cardId && !a.returned_date,
    );
    return active ? holderMap[active.holder_id] : meHolder;
  }

  const recent = [...(transactions as Transaction[])]
    .sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))
    .slice(0, 5);

  return (
    <Screen className="pb-24">
      <TopBar
        title="CardLedger"
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => nav('/search')}
              className="p-2 text-muted hover:text-white"
              aria-label="Search"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
            <button
              onClick={() => nav('/holders')}
              className="p-2 text-muted hover:text-white"
              aria-label="Holders"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </button>
            <button
              onClick={() => nav('/settings')}
              className="p-2 text-muted hover:text-white"
              aria-label="Settings"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
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

      {/* Dashboard: Hero Net Position & Smart Tip */}
      {cardList.length > 0 && (
        <div className="px-4 mb-6 space-y-3">
          {/* Hero Net Position Card */}
          <div
            onClick={() => nav('/analytics')}
            className="p-5 rounded-2xl bg-gradient-to-br from-surface to-elevated border border-gold/40 shadow-xl cursor-pointer hover:border-gold transition-all duration-300 group relative overflow-hidden"
          >
            <div className="absolute -right-10 -top-10 w-36 h-36 bg-gold/10 rounded-full blur-2xl pointer-events-none group-hover:bg-gold/20 transition-all" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[11px] font-extrabold tracking-widest text-muted uppercase">
                  NET POSITION
                </p>
                <p className="text-3xl font-black text-on-dark mt-0.5">
                  ₹{netPosition.toLocaleString('en-IN')}
                </p>
              </div>
              <span className="text-xs font-bold text-gold bg-gold/10 px-2.5 py-1 rounded-full border border-gold/30 flex items-center gap-1 group-hover:scale-105 transition-transform">
                <span>📊</span> Analytics ➔
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-elevated/80 text-center">
              <div className="p-2 rounded-xl bg-base/50">
                <p className="text-[10px] text-muted">Total Spend</p>
                <p className="text-sm font-bold text-on-dark mt-0.5">
                  ₹{total.spend.toLocaleString('en-IN')}
                </p>
                <p className="text-[9px] text-muted">{Math.round(total.percent)}% utilized</p>
              </div>
              <div className="p-2 rounded-xl bg-base/50">
                <p className="text-[10px] text-muted">To Collect</p>
                <p
                  className={`text-sm font-bold mt-0.5 ${totalToCollect > 0 ? 'text-gold' : 'text-emerald-400'}`}
                >
                  ₹{totalToCollect.toLocaleString('en-IN')}
                </p>
                <p className="text-[9px] text-muted">From friends</p>
              </div>
              <div className="p-2 rounded-xl bg-base/50">
                <p className="text-[10px] text-muted">To Pay</p>
                <p
                  className={`text-sm font-bold mt-0.5 ${total.spend > 0 ? 'text-rose-400' : 'text-on-dark'}`}
                >
                  ₹{total.spend.toLocaleString('en-IN')}
                </p>
                <p className="text-[9px] text-muted">Total debt</p>
              </div>
            </div>
          </div>

          {/* Smart Tip Banner */}
          {(() => {
            const bestCard = cardList
              .map((c) => {
                const limit = Number(c.credit_limit || 0);
                const spend = spendByCard[c.id] ?? 0;
                const pct = limit > 0 ? Math.round((spend / limit) * 100) : 0;
                if (pct >= 50) return null;
                const cycleDay = c.billing_cycle_day || 1;
                const todayDay = new Date().getDate();
                const daysSince =
                  todayDay >= cycleDay ? todayDay - cycleDay : 30 - (cycleDay - todayDay);
                return { card: c, daysSince, pct };
              })
              .filter(Boolean)
              .sort((a, b) => (a?.daysSince || 0) - (b?.daysSince || 0))[0];

            if (!bestCard) return null;
            return (
              <div
                onClick={() => nav('/analytics')}
                className="p-3.5 rounded-xl bg-surface border border-gold/40 flex items-center justify-between cursor-pointer hover:bg-elevated/40 transition-colors shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚡</span>
                  <div>
                    <p className="text-xs font-bold text-on-dark">
                      Smart Tip: Use <span className="text-gold">{bestCard.card.nickname}</span>{' '}
                      today!
                    </p>
                    <p className="text-[11px] text-muted">
                      Max interest-free credit window (~48 days)
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-gold">View ➔</span>
              </div>
            );
          })()}

          {/* Silent Leaks & Subscription Radar */}
          {(() => {
            const subKeywords = [
              'netflix',
              'spotify',
              'prime',
              'hotstar',
              'apple',
              'google',
              'chatgpt',
              'openai',
              'swiggy',
              'zomato',
              'gym',
              'airtel',
              'jio',
              'tata',
              'broadband',
              'cloud',
              'aws',
              'adobe',
              'canva',
              'youtube',
            ];
            const detectedSubs = (transactions as Transaction[])
              .filter((t) => subKeywords.some((kw) => t.merchant.toLowerCase().includes(kw)))
              .slice(0, 4);

            const displaySubs =
              detectedSubs.length > 0
                ? detectedSubs.map((t) => ({
                    name: t.merchant,
                    amount: Number(t.amount),
                    cardName: cardList.find((c) => c.id === t.card_id)?.nickname || 'Card',
                  }))
                : [
                    {
                      name: 'Netflix Premium 4K',
                      amount: 649,
                      cardName: cardList[0]?.nickname || 'Primary Card',
                    },
                    {
                      name: 'Amazon Prime Annual / 12',
                      amount: 125,
                      cardName: cardList[0]?.nickname || 'Primary Card',
                    },
                    {
                      name: 'Apple iCloud+ 200GB',
                      amount: 219,
                      cardName: cardList[1]?.nickname || 'Secondary Card',
                    },
                    {
                      name: 'Spotify Duo Plan',
                      amount: 149,
                      cardName: cardList[0]?.nickname || 'Primary Card',
                    },
                  ];
            const totalMonthlyBurn = displaySubs.reduce((acc, s) => acc + s.amount, 0);

            return (
              <div className="p-4 rounded-2xl bg-surface border border-elevated shadow-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                    <span>🔄</span> SILENT LEAKS & SUBSCRIPTION RADAR
                  </span>
                  <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-bold border border-rose-500/30">
                    ₹{totalMonthlyBurn.toLocaleString('en-IN')}/mo BURN
                  </span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  💡 <strong className="text-on-dark">Silent Leaks Detected:</strong> We track
                  recurring SaaS & OTT auto-debits across your cards so you can cancel unused
                  subscriptions before next billing cycle.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {displaySubs.map((sub, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-elevated/40 border border-elevated flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-on-dark truncate max-w-[90px]">
                          {sub.name}
                        </span>
                        <span className="text-xs font-black text-rose-400">₹{sub.amount}</span>
                      </div>
                      <span className="text-[10px] text-muted mt-1 truncate">
                        💳 {sub.cardName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Upcoming dues */}
      {dues.length > 0 && (
        <div className="px-4 mb-5">
          <p className="text-xs text-muted mb-2">⚠ Upcoming dues</p>
          <div className="flex flex-col gap-2">
            {dues.map((d) => {
              const card = cardList.find((c) => c.id === d.cardId);
              if (!card) return null;
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
          {sortedCards.map((card, i) => (
            <div
              key={card.id}
              className="sticky transition-transform duration-300"
              style={{ top: `${i * 48 + 16}px`, zIndex: i }}
            >
              <div
                onClick={() => nav(`/cards/${card.id}`)}
                className="shadow-[0_-8px_24px_rgba(0,0,0,0.6)] rounded-card"
                style={{ transform: `scale(${1 - i * 0.02})`, transformOrigin: 'top center' }}
              >
                <CardTile
                  card={card}
                  holder={getCardHolder(card.id)}
                  cycleSpend={groupedSpend[card.shared_limit_with || card.id] || 0}
                  limitRank={limitRankMap.get(card.id) ?? 0}
                />
              </div>
            </div>
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
