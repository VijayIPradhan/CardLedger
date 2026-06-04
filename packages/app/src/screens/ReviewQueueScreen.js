import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// packages/app/src/screens/ReviewQueueScreen.tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useReviewStore } from '../store/reviewStore.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import { useCards } from '../data/hooks/useCards.js';
export default function ReviewQueueScreen() {
    const { queue, remove } = useReviewStore();
    const createTxn = useCreateTransaction();
    const { data: cards = [] } = useCards();
    if (queue.length === 0) {
        return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "Review Queue" }), _jsxs("div", { className: "flex flex-col items-center justify-center flex-1 gap-3 text-muted", children: [_jsx("span", { className: "text-4xl", children: "\u2713" }), _jsx("p", { className: "text-sm", children: "All caught up" })] }), _jsx(BottomNav, {})] }));
    }
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: `Review Queue (${queue.length})` }), _jsx("div", { className: "px-4 flex flex-col gap-3 pt-4", children: _jsx(AnimatePresence, { children: queue.map((item) => (_jsx(ReviewCard, { item: item, cards: cards, onConfirm: async (cardId, amount, merchant, date) => {
                            await createTxn.mutateAsync({
                                card_id: cardId,
                                amount,
                                merchant,
                                txn_date: date,
                                source: 'sms',
                                dedupe_hash: item.parseResult.dedupeHash,
                                raw_sms_encrypted: null,
                            });
                            remove(item.id);
                        }, onDismiss: () => remove(item.id) }, item.id))) }) }), _jsx(BottomNav, {})] }));
}
function ReviewCard({ item, cards, onConfirm, onDismiss }) {
    const pr = item.parseResult;
    const [amount, setAmount] = useState(String(pr.amount));
    const [merchant, setMerchant] = useState(pr.merchant);
    const [date, setDate] = useState(pr.date);
    const [cardId, setCardId] = useState(item.cardId ?? '');
    const [saving, setSaving] = useState(false);
    async function handleConfirm() {
        if (!cardId)
            return;
        setSaving(true);
        try {
            await onConfirm(cardId, parseFloat(amount), merchant, date);
        }
        finally {
            setSaving(false);
        }
    }
    const inputCls = 'w-full bg-elevated border border-elevated rounded-input px-3 py-2 text-sm focus:border-gold outline-none';
    return (_jsxs(motion.div, { layout: true, initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: -40 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "bg-surface rounded-card p-4 flex flex-col gap-3", children: [_jsx("p", { className: "text-xs text-muted font-mono leading-relaxed line-clamp-3", children: pr.raw.body }), _jsxs("p", { className: "text-xs text-muted", children: ["Bank: ", _jsx("span", { className: "text-white", children: pr.bank }), pr.last4 && (_jsxs(_Fragment, { children: [' ', "\u00B7 last4: ", _jsx("span", { className: "text-white", children: pr.last4 })] }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-xs text-muted", children: "Amount (\u20B9)" }), _jsx("input", { type: "number", className: inputCls, value: amount, onChange: (e) => setAmount(e.target.value) })] }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-xs text-muted", children: "Date" }), _jsx("input", { type: "date", className: inputCls, value: date, onChange: (e) => setDate(e.target.value) })] })] }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-xs text-muted", children: "Merchant" }), _jsx("input", { type: "text", className: inputCls, value: merchant, onChange: (e) => setMerchant(e.target.value) })] }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-xs text-muted", children: "Card" }), _jsxs("select", { className: inputCls, value: cardId, onChange: (e) => setCardId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Select card \u2014" }), cards.map((c) => (_jsxs("option", { value: c.id, children: [c.nickname, " \u00B7\u00B7\u00B7", c.last4] }, c.id)))] })] }), _jsxs("div", { className: "flex gap-2 pt-1", children: [_jsx("button", { onClick: handleConfirm, disabled: saving || !cardId, className: "flex-1 bg-gold font-semibold py-2 rounded-input text-sm disabled:opacity-50", children: saving ? 'Saving…' : 'Confirm' }), _jsx("button", { onClick: onDismiss, className: "flex-1 bg-elevated py-2 rounded-input text-sm text-muted", children: "Dismiss" })] })] }));
}
