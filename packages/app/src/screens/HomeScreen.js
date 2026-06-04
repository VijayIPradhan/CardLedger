import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { CardTile } from '../components/CardTile.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
export default function HomeScreen() {
    const nav = useNavigate();
    const { activeCardIndex, setActiveCardIndex } = useUiStore();
    const { data: cards = [] } = useCards();
    const { data: holders = [] } = useHolders();
    const { data: assignments = [] } = useAssignments();
    const { data: transactions = [] } = useTransactions();
    const holderMap = Object.fromEntries(holders.map((h) => [h.id, h]));
    const today = new Date().toISOString().split('T')[0];
    function getCardHolder(cardId) {
        const active = assignments.find((a) => a.card_id === cardId && !a.returned_date);
        return active ? holderMap[active.holder_id] : holders.find((h) => h.relationship === 'me');
    }
    function getCycleSpend(card) {
        const { start, end } = getCycleRange(card.billing_cycle_day, today);
        return transactions
            .filter((t) => t.card_id === card.id && t.txn_date >= start && t.txn_date <= end)
            .reduce((s, t) => s + Number(t.amount), 0);
    }
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "CardLedger", action: _jsx("button", { onClick: () => nav('/cards/new'), className: "w-8 h-8 rounded-full bg-elevated text-gold flex items-center justify-center text-xl leading-none", "aria-label": "Add card", children: "+" }) }), cards.length === 0 ? (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center text-muted gap-3 px-6", children: [_jsx("p", { className: "text-4xl", children: "\u25CE" }), _jsx("p", { className: "text-center text-sm", children: "No cards yet. Tap + to add your first card." })] })) : (_jsxs("div", { className: "flex-1 px-4 pt-4", children: [_jsx("div", { className: "relative h-56 mb-8", children: _jsx(AnimatePresence, { children: cards.map((card, i) => {
                                const offset = i - activeCardIndex;
                                const isActive = offset === 0;
                                return (_jsx(motion.div, { className: "absolute w-full px-2", style: { zIndex: cards.length - Math.abs(offset) }, animate: {
                                        y: offset * -8,
                                        scale: 1 - Math.abs(offset) * 0.04,
                                        opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.15,
                                    }, transition: { type: 'spring', stiffness: 300, damping: 30 }, onClick: () => isActive ? nav(`/cards/${card.id}`) : setActiveCardIndex(i), children: _jsx(CardTile, { card: card, holder: getCardHolder(card.id), cycleSpend: getCycleSpend(card) }) }, card.id));
                            }) }) }), _jsx("div", { className: "flex justify-center gap-2 mt-2 mb-6", children: cards.map((_, i) => (_jsx("button", { onClick: () => setActiveCardIndex(i), "aria-label": `Select card ${i + 1}`, className: `rounded-full transition-all ${i === activeCardIndex ? 'w-5 h-2 bg-gold' : 'w-2 h-2 bg-elevated'}` }, i))) }), _jsxs("div", { className: "px-2", children: [_jsx("p", { className: "text-xs text-muted uppercase tracking-widest mb-3", children: "Recent" }), transactions
                                .slice()
                                .reverse()
                                .slice(0, 5)
                                .map((txn) => (_jsxs("div", { className: "flex justify-between py-3 border-b border-elevated/50", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: txn.merchant }), _jsx("p", { className: "text-xs text-muted", children: txn.txn_date })] }), _jsxs("p", { className: "text-sm font-semibold text-danger", children: ["\u2212\u20B9", Number(txn.amount).toLocaleString('en-IN')] })] }, txn.id)))] })] })), _jsx(BottomNav, {})] }));
}
