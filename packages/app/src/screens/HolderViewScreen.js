import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
export default function HolderViewScreen() {
    const { data: holders = [] } = useHolders();
    const { data: cards = [] } = useCards();
    const { data: transactions = [] } = useTransactions();
    const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]));
    const friends = holders.filter((h) => h.relationship === 'friend');
    function getTotal(holder) {
        return transactions
            .filter((t) => t.holder_id_at_time === holder.id)
            .reduce((s, t) => s + Number(t.amount), 0);
    }
    function getBreakdown(holder) {
        const byCard = {};
        transactions
            .filter((t) => t.holder_id_at_time === holder.id)
            .forEach((t) => {
            byCard[t.card_id] = (byCard[t.card_id] ?? 0) + Number(t.amount);
        });
        return Object.entries(byCard)
            .map(([cardId, amount]) => ({ card: cardMap[cardId], amount }))
            .filter((x) => !!x.card);
    }
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "Holders" }), _jsxs("div", { className: "px-4 flex flex-col gap-4", children: [friends.length === 0 && (_jsx("p", { className: "text-muted text-sm text-center py-16", children: "No friends added yet" })), friends.map((holder, i) => {
                        const total = getTotal(holder);
                        const breakdown = getBreakdown(holder);
                        const initials = holder.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                        return (_jsxs(motion.div, { className: "bg-surface rounded-card p-5", initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring', stiffness: 200, damping: 25, delay: i * 0.05 }, children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-sm font-semibold", children: initials }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-semibold", children: holder.name }), _jsx("p", { className: "text-xs text-muted", children: holder.phone })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xs text-muted", children: "Total" }), _jsxs("p", { className: "font-semibold text-gold", children: ["\u20B9", total.toLocaleString('en-IN')] })] })] }), breakdown.map(({ card, amount }) => (_jsxs("div", { className: "flex justify-between items-center py-2 border-t border-elevated/50", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs bg-elevated px-2 py-0.5 rounded-chip text-muted", children: card.network }), _jsxs("span", { className: "text-sm", children: ["\u2022\u2022\u2022\u2022 ", card.last4] })] }), _jsxs("span", { className: "text-sm text-danger", children: ["\u2212\u20B9", amount.toLocaleString('en-IN')] })] }, card.id)))] }, holder.id));
                    })] }), _jsx(BottomNav, {})] }));
}
