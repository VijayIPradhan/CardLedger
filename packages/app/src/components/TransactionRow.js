import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
export function TransactionRow({ txn, holder, index = 0 }) {
    return (_jsxs(motion.div, { className: "flex items-center justify-between py-3 border-b border-elevated/50", initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30, delay: index * 0.04 }, children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium truncate", children: txn.merchant }), _jsxs("p", { className: "text-xs text-muted mt-0.5", children: [txn.txn_date, holder && ` · ${holder.name}`] })] }), _jsxs("p", { className: "text-sm font-semibold text-danger ml-4", children: ["\u2212\u20B9", Number(txn.amount).toLocaleString('en-IN')] })] }));
}
