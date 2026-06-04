import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from 'react-router-dom';
const tabs = [
    { path: '/', label: 'Home', icon: '⬡' },
    { path: '/holders', label: 'Holders', icon: '◎' },
    { path: '/settings', label: 'Settings', icon: '◈' },
];
export function BottomNav() {
    const { pathname } = useLocation();
    return (_jsx("nav", { className: "fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex", children: tabs.map((tab) => {
            const active = pathname === tab.path;
            return (_jsxs(Link, { to: tab.path, className: `flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${active ? 'text-gold' : 'text-muted'}`, children: [_jsx("span", { className: "text-lg leading-none", children: tab.icon }), _jsx("span", { children: tab.label }), active && _jsx("span", { className: "w-4 h-0.5 rounded-full bg-gold" })] }, tab.path));
        }) }));
}
