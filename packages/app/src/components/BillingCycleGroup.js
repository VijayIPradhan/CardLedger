import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TransactionRow } from './TransactionRow.js';
export function BillingCycleGroup({ label, transactions, holderMap }) {
    const total = transactions.reduce((s, t) => s + Number(t.amount), 0);
    return (_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "flex justify-between items-center mb-3", children: [_jsx("p", { className: "text-xs text-muted uppercase tracking-widest", children: label }), _jsxs("p", { className: "text-sm font-semibold text-gold", children: ["\u20B9", total.toLocaleString('en-IN')] })] }), transactions.map((txn, i) => (_jsx(TransactionRow, { txn: txn, holder: holderMap[txn.holder_id_at_time], index: i }, txn.id)))] }));
}
