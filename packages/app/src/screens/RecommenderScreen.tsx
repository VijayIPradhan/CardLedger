import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { CardTile } from '../components/CardTile.js';
import { api } from '../data/apiClient.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import type { Card, Holder } from '@cardledger/shared';
import { motion } from 'framer-motion';

export default function RecommenderScreen() {
  const [amount, setAmount] = useState('1000');
  const [category, setCategory] = useState('');

  const { data: userCards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const meHolder = holders.find((h: Holder) => h.relationship === 'me');

  const { data: recommendations, isFetching } = useQuery({
    queryKey: ['recommendations', amount, category],
    queryFn: () =>
      api
        .get('/cards/recommend', {
          params: { amount, category: category || undefined },
        })
        .then((r) => r.data),
    enabled: Boolean(amount) && Number(amount) > 0,
  });

  return (
    <Screen>
      <TopBar title="Which Card?" back />

      <div className="px-6 space-y-6 pb-24">
        <div className="bg-elevated p-6 rounded-3xl space-y-4 border border-elevated/50">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Spend Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-muted font-medium">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-base border border-elevated rounded-2xl py-3 pl-8 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                placeholder="1000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Category (Optional)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-base border border-elevated rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all appearance-none"
            >
              <option value="">Any Category</option>
              <option value="travel">Travel & Flights</option>
              <option value="dining">Dining & Food</option>
              <option value="shopping">Shopping</option>
              <option value="grocery">Grocery</option>
              <option value="utility">Utilities</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted uppercase tracking-wider">
            Recommendations
          </h3>

          {isFetching ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
            </div>
          ) : recommendations?.length > 0 ? (
            recommendations.map((rec: any, i: number) => {
              const card = (userCards as Card[]).find((c) => c.id === rec.cardId);
              if (!card) return null;

              return (
                <motion.div
                  key={rec.cardId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="space-y-2"
                >
                  <CardTile card={card} holder={meHolder} cycleSpend={0} />
                  <div className="flex items-center justify-between px-4 py-2 bg-accent/10 rounded-xl">
                    <span className="text-xs font-medium text-accent">Expected Rewards</span>
                    <span className="text-sm font-bold text-accent">~₹{rec.expectedValue}</span>
                  </div>
                  {rec.reasoning && <p className="text-xs text-muted px-4">{rec.reasoning}</p>}
                </motion.div>
              );
            })
          ) : (
            <div className="text-center py-8 text-sm text-muted">
              No cards match this spend profile
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}
