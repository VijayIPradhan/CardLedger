import { useState } from 'react';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { usePayments } from '../data/hooks/usePayments.js';
import type { Card, Holder, Transaction, Payment } from '@cardledger/shared';

const TABS = [
  { id: 'shield', label: '🛡️ 30% Shield' },
  { id: 'recommender', label: '⚡ Recommender' },
  { id: 'recovery', label: '🤝 Recovery' },
  { id: 'insights', label: '📊 Insights' },
];

function money(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function calculateInterestFreeDays(cycleDay: number): number {
  const today = new Date();
  const currentDay = today.getDate();
  let daysSinceCycle = 0;
  if (currentDay >= cycleDay) {
    daysSinceCycle = currentDay - cycleDay;
  } else {
    // cycle started last month
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, cycleDay);
    const diffTime = Math.abs(today.getTime() - lastMonth.getTime());
    daysSinceCycle = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return Math.max(15, Math.min(50, 50 - daysSinceCycle));
}

export default function AnalyticsScreen() {
  const [activeTab, setActiveTab] = useState('shield');
  const { data: cards = [], isLoading: cardsLoading } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: transactions = [] } = useTransactions();
  const { data: allPayments = [] } = usePayments();

  const cardList = cards as Card[];
  const friendList = holders.filter((h: Holder) => h.relationship === 'friend');
  const txns = transactions as Transaction[];
  const payments = allPayments as Payment[];

  // Analytics calculations
  let totalToCollect = 0;
  let totalFriendSpend = 0;
  friendList.forEach((friend: Holder) => {
    const expenses = txns
      .filter((t) => t.holder_id_at_time === friend.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    const paid = payments
      .filter((p) => p.holder_id === friend.id)
      .reduce((s, p) => s + Number(p.amount), 0);
    totalFriendSpend += expenses;
    totalToCollect += expenses - paid;
  });

  const totalLimit = cardList
    .filter((c) => !c.shared_limit_with)
    .reduce((acc, c) => acc + Number(c.credit_limit || 0), 0);
  const totalSpendVal = cardList.reduce((acc, c) => acc + Number(c.current_spend || 0), 0);
  const overallPct = totalLimit > 0 ? Math.round((totalSpendVal / totalLimit) * 100) : 0;
  const isSafe = overallPct < 30;
  const isCaution = overallPct >= 30 && overallPct <= 50;

  if (cardsLoading) {
    return (
      <Screen className="pb-24">
        <TopBar title="Financial Intelligence" />
        <div className="flex items-center justify-center h-64 text-muted">Loading analytics...</div>
        <BottomNav />
      </Screen>
    );
  }

  return (
    <Screen className="pb-28">
      <TopBar title="Financial Intelligence" />

      {/* Sub-header & Tabs */}
      <div className="px-4 py-3 bg-base border-b border-elevated">
        <p className="text-xs text-muted mb-3">
          State-of-the-art credit optimization & cashflow analytics
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-gold text-base shadow-lg shadow-gold/20 scale-105'
                    : 'bg-surface text-on-dark border border-elevated hover:border-gold/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* ── TAB 0: 🛡️ 30% SHIELD ──────────────────────────────────────── */}
        {activeTab === 'shield' && (
          <div className="space-y-4 animate-fade-in">
            {/* Overall Shield Banner */}
            <div
              className={`p-5 rounded-2xl bg-surface border-2 ${
                isSafe
                  ? 'border-emerald-500/80 bg-emerald-950/10'
                  : isCaution
                    ? 'border-amber-500/80 bg-amber-950/10'
                    : 'border-rose-500/80 bg-rose-950/10'
              } shadow-xl`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-widest text-muted flex items-center gap-1.5">
                  <span>🛡️</span> CREDIT UTILIZATION SHIELD
                </span>
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                    isSafe
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isCaution
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {isSafe
                    ? '✨ EXCELLENT (<30%)'
                    : isCaution
                      ? '⚠️ CAUTION (30-50%)'
                      : '🚨 HIGH (>50%)'}
                </span>
              </div>

              <div className="flex justify-between items-end mb-3">
                <div>
                  <p className="text-xs text-muted">Overall Utilization</p>
                  <p className="text-3xl font-black text-on-dark">{overallPct}%</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total Spend vs Limit</p>
                  <p className="text-sm font-bold text-on-dark-mid">
                    {money(totalSpendVal)} / {money(totalLimit)}
                  </p>
                </div>
              </div>

              <div className="w-full bg-elevated h-2.5 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full transition-all duration-500 ${
                    isSafe ? 'bg-emerald-500' : isCaution ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, overallPct)}%` }}
                />
              </div>

              <p className="text-[11px] text-muted-low leading-relaxed">
                💡 <strong className="text-on-dark">Industry Rule:</strong> Keeping card utilization
                below 30% is the single most effective way to protect and boost your credit score.
              </p>

              <div className="mt-3 p-3.5 rounded-xl bg-gold/10 border border-gold/30 text-xs leading-relaxed text-on-dark space-y-1.5 shadow-sm">
                <p className="font-bold text-gold flex items-center gap-1.5">
                  <span>🎯</span> Pro Tip: The Statement Date Hack (Pre-Payment)
                </p>
                <p className="text-[11px] text-muted-low">
                  Credit bureaus (CIBIL, Experian) only record the balance reported on your{' '}
                  <strong className="text-on-dark">statement generation date (cycle day)</strong>.
                  If you spend heavily during the month,{' '}
                  <strong className="text-gold">
                    pay off your balance BEFORE your statement date!
                  </strong>{' '}
                  The pre-paid amount won't be counted in your reported utilization, keeping your
                  credit score pristine!
                </p>
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-xs font-bold tracking-wider text-muted mb-2">
                CARD HEADROOM CALCULATOR (30% THRESHOLD)
              </h3>
              <div className="space-y-3">
                {cardList
                  .map((card) => {
                    const limit = Number(card.credit_limit || 0);
                    const spend = Number(card.current_spend || 0);
                    const pct = limit > 0 ? Math.round((spend / limit) * 100) : 0;
                    const max30 = limit * 0.3;
                    const headroom30 = Math.max(0, max30 - spend);
                    const max50 = limit * 0.5;
                    const headroom50 = Math.max(0, max50 - spend);
                    return { card, limit, spend, pct, max30, headroom30, headroom50 };
                  })
                  .sort((a, b) => b.pct - a.pct)
                  .map(({ card, limit, spend, pct, headroom30, headroom50, max30 }) => {
                    const safe = pct < 30;
                    const caution = pct >= 30 && pct <= 50;
                    return (
                      <div
                        key={card.id}
                        className="p-4 rounded-xl bg-surface border border-elevated space-y-3 hover:border-gold/30 transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-on-dark">{card.nickname}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              safe
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : caution
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {pct}% UTILIZED
                          </span>
                        </div>

                        <div className="w-full bg-elevated h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${safe ? 'bg-emerald-500' : caution ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-xs text-muted">
                          <span>{money(spend)} spent</span>
                          <span>{money(limit)} limit</span>
                        </div>

                        <div className="pt-2 border-t border-elevated/60 flex items-center gap-2 text-xs">
                          <span>{safe ? '⚡' : caution ? '⚠️' : '🚨'}</span>
                          <span
                            className={
                              safe
                                ? 'text-emerald-400 font-medium'
                                : caution
                                  ? 'text-amber-400 font-medium'
                                  : 'text-rose-400 font-medium'
                            }
                          >
                            {safe
                              ? `You can spend ${money(headroom30)} more before reaching the 30% safe threshold.`
                              : caution
                                ? `30% breached! You have ${money(headroom50)} remaining before hitting 50% utilization.`
                                : `High utilization! Pay down ${money(spend - max30)} to return to the 30% safe zone.`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 1: ⚡ SMART RECOMMENDER ───────────────────────────────── */}
        {activeTab === 'recommender' && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-xs font-bold tracking-wider text-muted">
              SMART CARD RECOMMENDER (INTEREST-FREE WINDOW)
            </h3>

            {(() => {
              const recs = cardList
                .map((card) => {
                  const limit = Number(card.credit_limit || 0);
                  const spend = Number(card.current_spend || 0);
                  const pct = limit > 0 ? Math.round((spend / limit) * 100) : 0;
                  if (pct >= 50) return null;
                  const cycleDay = card.billing_cycle_day || 1;
                  const estDaysFree = calculateInterestFreeDays(cycleDay);
                  const headroom30 = Math.max(0, limit * 0.3 - spend);
                  return { card, estDaysFree, headroom30, pct };
                })
                .filter(Boolean)
                .sort((a, b) => (b?.estDaysFree || 0) - (a?.estDaysFree || 0));

              if (!recs.length) {
                return (
                  <div className="p-4 rounded-xl bg-surface text-center text-muted">
                    No card recommendations available. Keep utilization below 50% to see
                    interest-free suggestions!
                  </div>
                );
              }

              const best = recs[0]!;
              return (
                <div className="space-y-4">
                  {/* Best Card Card */}
                  <div className="p-5 rounded-2xl bg-surface border-2 border-gold shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold tracking-widest text-gold flex items-center gap-1.5">
                        <span>🏆</span> BEST CARD FOR SPENDING TODAY
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-gold text-base font-black text-xs shadow-md">
                        ~{best.estDaysFree} DAYS FREE
                      </span>
                    </div>

                    <h2 className="text-2xl font-black text-on-dark mb-2">{best.card.nickname}</h2>

                    <div className="flex justify-between items-center text-sm mb-4">
                      <span className="text-muted">30% Safe Headroom</span>
                      <span className="font-bold text-emerald-400">{money(best.headroom30)}</span>
                    </div>

                    <div className="pt-3 border-t border-elevated text-xs text-muted-low leading-relaxed">
                      💡 <strong className="text-on-dark">Why?</strong> Statement cycle started
                      recently (Cycle Day {best.card.billing_cycle_day}). Purchases made today get
                      maximum interest-free credit!
                    </div>
                  </div>

                  {recs.length > 1 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold tracking-wider text-muted">
                        OTHER RECOMMENDED CARDS
                      </h4>
                      {recs.slice(1).map((rec) => (
                        <div
                          key={rec!.card.id}
                          className="p-3.5 rounded-xl bg-surface border border-elevated flex justify-between items-center"
                        >
                          <div>
                            <p className="font-bold text-sm text-on-dark">{rec!.card.nickname}</p>
                            <p className="text-xs text-muted">
                              Headroom: {money(rec!.headroom30)} · Utilized: {rec!.pct}%
                            </p>
                          </div>
                          <span className="px-2 py-1 rounded bg-elevated text-gold font-bold text-xs">
                            ~{rec!.estDaysFree}d free
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB 2: 🤝 DEBT RECOVERY RADAR ─────────────────────────────── */}
        {activeTab === 'recovery' && (
          <div className="space-y-4 animate-fade-in">
            {(() => {
              const totalCollected = Math.max(0, totalFriendSpend - totalToCollect);
              const recoveryPct =
                totalFriendSpend > 0 ? Math.round((totalCollected / totalFriendSpend) * 100) : 100;

              return (
                <div className="p-5 rounded-2xl bg-surface border-2 border-gold/80 shadow-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold tracking-widest text-muted flex items-center gap-1.5">
                      <span>🤝</span> DEBT RECOVERY RADAR
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${recoveryPct === 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gold/20 text-gold'}`}
                    >
                      {recoveryPct}% RECOVERED
                    </span>
                  </div>

                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-xs text-muted">Net Outstanding Debt</p>
                      <p
                        className={`text-3xl font-black ${totalToCollect > 0 ? 'text-gold' : 'text-emerald-400'}`}
                      >
                        {money(totalToCollect)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted">Total Collected</p>
                      <p className="text-sm font-bold text-on-dark-mid">{money(totalCollected)}</p>
                    </div>
                  </div>

                  <div className="w-full bg-elevated h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${recoveryPct === 100 ? 'bg-emerald-500' : 'bg-gold'}`}
                      style={{ width: `${Math.min(100, recoveryPct)}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold tracking-wider text-muted">
                WHO OWES WHAT (BY FRIEND)
              </h3>
              {friendList.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface text-center text-muted text-xs">
                  No friend transactions recorded yet.
                </div>
              ) : (
                friendList.map((friend: Holder) => {
                  const friendExpenses = txns
                    .filter((t) => t.holder_id_at_time === friend.id)
                    .reduce((s, t) => s + Number(t.amount), 0);
                  const friendPaid = payments
                    .filter((p) => p.holder_id === friend.id)
                    .reduce((s, p) => s + Number(p.amount), 0);
                  const owed = Math.max(0, friendExpenses - friendPaid);

                  if (friendExpenses === 0) return null;

                  return (
                    <div
                      key={friend.id}
                      className="p-4 rounded-xl bg-surface border border-elevated flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-elevated text-gold flex items-center justify-center font-bold text-sm">
                          {friend.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-on-dark">{friend.name}</p>
                          <p className="text-xs text-muted">
                            Total volume: {money(friendExpenses)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-sm text-gold">{money(owed)}</p>
                        <p className="text-[10px] text-muted">Outstanding</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: 📊 SPEND INSIGHTS ──────────────────────────────────── */}
        {activeTab === 'insights' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-5 rounded-2xl bg-surface border border-elevated space-y-3">
              <span className="text-xs font-bold tracking-widest text-muted">
                30-DAY VELOCITY & BURN RATE
              </span>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-muted">Total Spend Volume</p>
                  <p className="text-3xl font-black text-on-dark">{money(totalSpendVal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Daily Burn Rate</p>
                  <p className="text-sm font-bold text-gold">{money(totalSpendVal / 30)} / day</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold tracking-wider text-muted">SPEND BY CARD</h3>
              {cardList.map((card) => {
                const spend = Number(card.current_spend || 0);
                const limit = Number(card.credit_limit || 0);
                const pct = limit > 0 ? Math.round((spend / limit) * 100) : 0;
                return (
                  <div
                    key={card.id}
                    className="p-3.5 rounded-xl bg-surface border border-elevated flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-sm text-on-dark">{card.nickname}</p>
                      <p className="text-xs text-muted">
                        {card.bank} · {card.network}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-on-dark">{money(spend)}</p>
                      <p className="text-[11px] text-muted">{pct}% utilized</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </Screen>
  );
}
