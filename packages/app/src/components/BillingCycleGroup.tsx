import type { Transaction, Holder } from '@cardledger/shared';
import { TransactionRow } from './TransactionRow.js';

interface BillingCycleGroupProps {
  label: string;
  transactions: Transaction[];
  holderMap: Record<string, Holder>;
}

export function BillingCycleGroup({ label, transactions, holderMap }: BillingCycleGroupProps) {
  const total = transactions.reduce((s, t) => s + Number(t.amount), 0);
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-muted uppercase tracking-widest">{label}</p>
        <p className="text-sm font-semibold text-gold">₹{total.toLocaleString('en-IN')}</p>
      </div>
      {transactions.map((txn, i) => (
        <TransactionRow
          key={txn.id}
          txn={txn}
          holder={holderMap[txn.holder_id_at_time]}
          index={i}
        />
      ))}
    </div>
  );
}
