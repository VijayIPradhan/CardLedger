import { useState, useMemo } from 'react';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { TransactionRow } from '../components/TransactionRow.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { usePayments } from '../data/hooks/usePayments.js';
import type { Card, Holder, Transaction, Payment } from '@cardledger/shared';
import { motion } from 'framer-motion';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: transactions = [] } = useTransactions();
  const { data: payments = [] } = usePayments();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
    const cardMap = Object.fromEntries(cards.map((c: Card) => [c.id, c]));

    const filteredTxns = (transactions as Transaction[])
      .filter((txn) => {
        const merchant = txn.merchant.toLowerCase();
        const cardName = cardMap[txn.card_id]?.nickname?.toLowerCase() || '';
        const bankName = cardMap[txn.card_id]?.bank?.toLowerCase() || '';
        const holderName = holderMap[txn.holder_id_at_time]?.name?.toLowerCase() || '';

        return (
          merchant.includes(q) ||
          cardName.includes(q) ||
          bankName.includes(q) ||
          holderName.includes(q) ||
          (q === 'payment' && txn.type !== 'spend') ||
          (q === 'spend' && txn.type === 'spend')
        );
      })
      .map((txn) => ({ ...txn, isPaymentObj: false }));

    const filteredPayments = (payments as Payment[])
      .filter((p) => {
        const holderName = holderMap[p.holder_id]?.name?.toLowerCase() || '';
        const notes = p.notes?.toLowerCase() || '';

        return (
          holderName.includes(q) ||
          notes.includes(q) ||
          ['payment', 'paid', 'received', 'collection'].includes(q)
        );
      })
      .map((p) => ({
        id: p.id,
        merchant: `Payment Recorded · ${holderMap[p.holder_id]?.name || 'Friend'}`,
        amount: p.amount,
        txn_date: p.payment_date,
        holder_id_at_time: p.holder_id,
        type: 'payment',
        isPaymentObj: true,
        notes: p.notes,
      }));

    return [...filteredTxns, ...filteredPayments].sort(
      (a, b) => new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime(),
    );
  }, [query, transactions, payments, cards, holders]);

  return (
    <Screen>
      <TopBar title="Search" back />

      <div className="px-6 pb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search transactions, cards, friends..."
            className="w-full bg-elevated border border-elevated/50 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <svg
            className="absolute left-4 top-3.5 w-4 h-4 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <div className="px-6 pb-24">
        {!query.trim() ? (
          <div className="py-12 text-center text-muted text-sm">
            Start typing to search across your ledger
          </div>
        ) : results.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">No results found for "{query}"</div>
        ) : (
          <div className="space-y-1">
            {results.map((item, i) =>
              item.isPaymentObj ? (
                <motion.div
                  key={`pay-${item.id}`}
                  className="flex items-center justify-between py-3 border-b border-elevated/50"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.merchant}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {item.txn_date.substring(0, 10)}
                      {(item as any).notes && ` · ${(item as any).notes}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-accent ml-4">
                    +₹{Number(item.amount).toLocaleString('en-IN')}
                  </p>
                </motion.div>
              ) : (
                <TransactionRow
                  key={`txn-${item.id}`}
                  txn={item as Transaction}
                  holder={holders.find((h: Holder) => h.id === item.holder_id_at_time)}
                  index={i}
                />
              ),
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
