import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
export default function CardDetailScreen() {
    const { id } = useParams();
    const { data: card } = useCard(id);
    const { data: holders = [] } = useHolders();
    const { data: assignments = [] } = useAssignments(id);
    const { data: transactions = [] } = useTransactions({ card_id: id });
    if (!card) {
        return (_jsx(Screen, { children: _jsx("div", { className: "flex-1 flex items-center justify-center text-muted", children: "Loading\u2026" }) }));
    }
    const holderMap = Object.fromEntries(holders.map((h) => [h.id, h]));
    const cycles = [-2, -1, 0]
        .map((offset) => {
        const refDate = new Date();
        refDate.setMonth(refDate.getMonth() + offset);
        const ref = refDate.toISOString().split('T')[0];
        const { start, end } = getCycleRange(card.billing_cycle_day, ref);
        const txns = transactions.filter((t) => t.txn_date >= start && t.txn_date <= end);
        return { label: `${start} – ${end}`, txns };
    })
        .filter((c) => c.txns.length > 0);
    const activeAssignment = assignments.find((a) => !a.returned_date);
    const currentHolder = activeAssignment
        ? holderMap[activeAssignment.holder_id]
        : holders.find((h) => h.relationship === 'me');
    const cycleSpend = cycles[cycles.length - 1]?.txns.reduce((s, t) => s + Number(t.amount), 0) ?? 0;
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: card.nickname, back: true }), _jsx("div", { className: "px-4 mb-6", children: _jsx(CardTile, { card: card, holder: currentHolder, cycleSpend: cycleSpend }) }), _jsxs("div", { className: "px-4", children: [cycles.map((c) => (_jsx(BillingCycleGroup, { label: c.label, transactions: c.txns, holderMap: holderMap }, c.label))), cycles.length === 0 && (_jsx("p", { className: "text-muted text-sm text-center py-8", children: "No transactions yet" }))] }), _jsx(BottomNav, {})] }));
}
