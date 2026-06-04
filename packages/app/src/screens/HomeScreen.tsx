import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { CardTile } from '../components/CardTile.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
import type { Card, Holder, Transaction, Assignment } from '@cardledger/shared';

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const today = new Date().toISOString().split('T')[0];

  function getCardHolder(cardId: string): Holder | undefined {
    const active = assignments.find(
      (a: Assignment) => a.card_id === cardId && !a.returned_date,
    );
    return active ? holderMap[active.holder_id] : holders.find((h: Holder) => h.relationship === 'me');
  }

  function getCycleSpend(card: Card): number {
    const { start, end } = getCycleRange(card.billing_cycle_day, today);
    return transactions
      .filter((t: Transaction) => t.card_id === card.id && t.txn_date >= start && t.txn_date <= end)
      .reduce((s: number, t: Transaction) => s + Number(t.amount), 0);
  }

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

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3 px-6">
          <p className="text-4xl">◎</p>
          <p className="text-center text-sm">No cards yet. Tap + to add your first card.</p>
        </div>
      ) : (
        <div className="flex-1 px-4 pt-4">
          <div className="relative h-56 mb-8">
            <AnimatePresence>
              {cards.map((card: Card, i: number) => {
                const offset = i - activeCardIndex;
                const isActive = offset === 0;
                return (
                  <motion.div
                    key={card.id}
                    className="absolute w-full px-2"
                    style={{ zIndex: cards.length - Math.abs(offset) }}
                    animate={{
                      y: offset * -8,
                      scale: 1 - Math.abs(offset) * 0.04,
                      opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.15,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    onClick={() =>
                      isActive ? nav(`/cards/${card.id}`) : setActiveCardIndex(i)
                    }
                  >
                    <CardTile
                      card={card}
                      holder={getCardHolder(card.id)}
                      cycleSpend={getCycleSpend(card)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="flex justify-center gap-2 mt-2 mb-6">
            {cards.map((_: Card, i: number) => (
              <button
                key={i}
                onClick={() => setActiveCardIndex(i)}
                aria-label={`Select card ${i + 1}`}
                className={`rounded-full transition-all ${
                  i === activeCardIndex ? 'w-5 h-2 bg-gold' : 'w-2 h-2 bg-elevated'
                }`}
              />
            ))}
          </div>

          <div className="px-2">
            <p className="text-xs text-muted uppercase tracking-widest mb-3">Recent</p>
            {transactions
              .slice()
              .reverse()
              .slice(0, 5)
              .map((txn: Transaction) => (
                <div key={txn.id} className="flex justify-between py-3 border-b border-elevated/50">
                  <div>
                    <p className="text-sm font-medium">{txn.merchant}</p>
                    <p className="text-xs text-muted">{txn.txn_date}</p>
                  </div>
                  <p className="text-sm font-semibold text-danger">
                    −₹{Number(txn.amount).toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
      <BottomNav />
    </Screen>
  );
}
