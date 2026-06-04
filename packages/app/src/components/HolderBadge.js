import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function HolderBadge({ holder }) {
    const initials = holder.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    const isMe = holder.relationship === 'me';
    return (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: `w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${isMe ? 'bg-gold text-base' : 'bg-elevated text-white'}`, children: initials }), _jsx("span", { className: "text-xs text-muted", children: isMe ? 'Me' : holder.name })] }));
}
