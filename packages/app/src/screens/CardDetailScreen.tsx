import { useParams } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BillingCycleGroup } from '../components/BillingCycleGroup.js';
import { CardTile } from '../components/CardTile.js';
import { useCard } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction, Holder, Assignment } from '@cardledger/shared';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: card } = useCard(id!);
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments(id);
  const { data: transactions = [] } = useTransactions({ card_id: id });

  if (!card) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>
      </Screen>
    );
  }

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const today = new Date().toISOString().split('T')[0];

  const cycles = ([-2, -1, 0] as const).map((offset) => {
    const refDate = new Date();
    refDate.setMonth(refDate.getMonth() + offset);
    const ref = refDate.toISOString().split('T')[0];
    const { start, end } = getCycleRange(card.billing_cycle_day, ref);
    const txns = transactions.filter(
      (t: Transaction) => t.txn_date >= start && t.txn_date <= end,
    );
    return { label: `${start} – ${end}`, txns };
  }).filter((c) => c.txns.length > 0);

  const activeAssignment = assignments.find((a: Assignment) => !a.returned_date);
  const currentHolder = activeAssignment
    ? holderMap[activeAssignment.holder_id]
    : holders.find((h: Holder) => h.relationship === 'me');
  const cycleSpend =
    cycles[cycles.length - 1]?.txns.reduce((s: number, t: Transaction) => s + Number(t.amount), 0) ?? 0;

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-6">
        <CardTile card={card} holder={currentHolder} cycleSpend={cycleSpend} />
      </div>
      <div className="px-4">
        {cycles.map((c) => (
          <BillingCycleGroup
            key={c.label}
            label={c.label}
            transactions={c.txns}
            holderMap={holderMap}
          />
        ))}
        {cycles.length === 0 && (
          <p className="text-muted text-sm text-center py-8">No transactions yet</p>
        )}
      </div>
      <BottomNav />
    </Screen>
  );
}
