import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { getDaysUntilDue } from '@cardledger/shared';
import { SpendRing } from './SpendRing.js';
import { DueDateChip } from './DueDateChip.js';
import { HolderBadge } from './HolderBadge.js';
const NETWORK_COLORS = {
    Visa: 'from-[#1a237e] to-[#283593]',
    Mastercard: 'from-[#b71c1c] to-[#c62828]',
    RuPay: 'from-[#1b5e20] to-[#2e7d32]',
    Amex: 'from-[#006064] to-[#00838f]',
};
export function CardTile({ card, holder, cycleSpend, onClick }) {
    const gradient = NETWORK_COLORS[card.network] ?? 'from-elevated to-surface';
    const today = new Date().toISOString().split('T')[0];
    const daysLeft = getDaysUntilDue(card.payment_due_day, today);
    return (_jsxs(motion.div, { onClick: onClick, className: `relative w-full aspect-[1.586/1] rounded-card bg-gradient-to-br ${gradient} p-6 cursor-pointer select-none`, whileTap: { scale: 0.97 }, transition: { type: 'spring', stiffness: 400, damping: 30 }, children: [_jsx("div", { className: "absolute inset-0 rounded-card bg-black/10" }), _jsxs("div", { className: "relative flex flex-col justify-between h-full", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-white/60 mb-1", children: card.bank }), _jsx("p", { className: "text-lg font-semibold", children: card.nickname })] }), holder && _jsx(HolderBadge, { holder: holder })] }), _jsxs("div", { className: "flex justify-between items-end", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-xs text-white/60 mb-1", children: ["\u2022\u2022\u2022\u2022 ", card.last4] }), _jsx(DueDateChip, { daysLeft: daysLeft })] }), _jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx(SpendRing, { spent: cycleSpend, limit: Number(card.credit_limit) }), _jsxs("p", { className: "text-[10px] text-white/60", children: ["\u20B9", cycleSpend.toLocaleString('en-IN')] })] })] })] })] }));
}
