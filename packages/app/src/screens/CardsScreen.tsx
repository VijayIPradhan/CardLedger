import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { CardTile } from '../components/CardTile.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import type { Card, Holder, Assignment } from '@cardledger/shared';
import { motion } from 'framer-motion';

export default function CardsScreen() {
  const nav = useNavigate();
  const { data: cards = [], isLoading } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const meHolder = holders.find((h: Holder) => h.relationship === 'me');

  const cardList = cards as Card[];
  const sortedByLimit = [...cardList].sort(
    (a, b) => Number(b.credit_limit) - Number(a.credit_limit),
  );
  const limitRankMap = new Map<string, number>(sortedByLimit.map((c, i) => [c.id, i + 1]));

  const sortedCards = [...cardList].sort((a, b) => {
    const diff = Number(b.current_spend || 0) - Number(a.current_spend || 0);
    if (diff !== 0) return diff;
    return Number(b.credit_limit) - Number(a.credit_limit);
  });

  return (
    <Screen>
      <TopBar title="My Cards" back />

      {isLoading && cardList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
        </div>
      ) : cardList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
          <p className="text-muted">No cards yet</p>
          <button
            onClick={() => nav('/cards/new')}
            className="px-6 py-3 bg-accent text-base rounded-2xl font-semibold shadow-lg hover:bg-accent/90 transition-colors"
          >
            Add card
          </button>
        </div>
      ) : (
        <div className="px-6 pb-24 space-y-4">
          {sortedCards.map((card, i) => {
            const activeAssignment = (assignments as Assignment[]).find(
              (a) => a.card_id === card.id && !a.returned_date,
            );
            const currentHolder = activeAssignment
              ? holderMap[activeAssignment.holder_id]
              : meHolder;
            const initials = currentHolder
              ? currentHolder.name.substring(0, 2).toUpperCase()
              : '??';

            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <CardTile
                  card={card}
                  holder={currentHolder}
                  cycleSpend={card.current_spend || 0}
                  limitRank={limitRankMap.get(card.id)}
                  onClick={() => nav(`/cards/${card.id}`)}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => nav('/cards/new')}
        className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-accent text-base text-2xl font-bold shadow-lg flex items-center justify-center"
        aria-label="Add card"
      >
        +
      </button>
    </Screen>
  );
}
