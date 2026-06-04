import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/app/src/components/BottomNav.tsx
import { Link, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useReviewStore } from '../store/reviewStore.js';
const WEB_TABS = [
    { path: '/', label: 'Home', icon: '⬡' },
    { path: '/holders', label: 'Holders', icon: '◎' },
    { path: '/settings', label: 'Settings', icon: '◈' },
];
const ANDROID_TABS = [...WEB_TABS, { path: '/sms', label: 'SMS', icon: '✉' }];
export function BottomNav() {
    const { pathname } = useLocation();
    const reviewCount = useReviewStore((s) => s.queue.length);
    const tabs = Capacitor.isNativePlatform() ? ANDROID_TABS : WEB_TABS;
    return (_jsx("nav", { className: "fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex", children: tabs.map((tab) => {
            const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
            const isSms = tab.path === '/sms';
            return (_jsxs(Link, { to: tab.path, className: `flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${active ? 'text-gold' : 'text-muted'}`, children: [_jsxs("span", { className: "text-lg leading-none relative", children: [tab.icon, isSms && reviewCount > 0 && (_jsx("span", { className: "absolute -top-1 -right-2 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center", children: reviewCount > 9 ? '9+' : reviewCount }))] }), _jsx("span", { children: tab.label }), active && _jsx("span", { className: "w-4 h-0.5 rounded-full bg-gold" })] }, tab.path));
        }) }));
}
