import { jsx as _jsx } from "react/jsx-runtime";
export function DueDateChip({ daysLeft }) {
    const urgent = daysLeft <= 3;
    return (_jsx("span", { className: `text-xs px-2 py-1 rounded-chip font-medium ${urgent ? 'bg-danger/20 text-danger' : 'bg-elevated text-muted'}`, children: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d` }));
}
