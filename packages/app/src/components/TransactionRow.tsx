import { motion } from 'framer-motion';
import type { Transaction, Holder } from '@cardledger/shared';

interface TransactionRowProps {
  txn: Transaction;
  holder?: Holder;
  index?: number;
}

export function TransactionRow({ txn, holder, index = 0 }: TransactionRowProps) {
  return (
    <motion.div
      className="flex items-center justify-between py-3 border-b border-elevated/50"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.04 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{txn.merchant}</p>
        <p className="text-xs text-muted mt-0.5">
          {txn.txn_date}
          {holder && ` · ${holder.name}`}
        </p>
      </div>
      <p className="text-sm font-semibold text-danger ml-4">
        −₹{Number(txn.amount).toLocaleString('en-IN')}
      </p>
    </motion.div>
  );
}
