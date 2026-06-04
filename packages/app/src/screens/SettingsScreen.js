import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { PinPad } from '../components/PinPad.js';
import { logout } from '../data/apiClient.js';
import { useUiStore } from '../store/uiStore.js';
import { isPinSet, setupPin } from '../lib/pin.js';
export default function SettingsScreen() {
    const nav = useNavigate();
    const lock = useUiStore((s) => s.lock);
    const [changingPin, setChangingPin] = useState(false);
    function handleLockNow() {
        lock();
        nav('/lock', { replace: true });
    }
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "Settings" }), _jsxs("div", { className: "px-4 flex flex-col gap-3", children: [_jsxs("div", { className: "bg-surface rounded-card overflow-hidden", children: [_jsxs("button", { onClick: handleLockNow, className: "w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: "Lock app now" }), _jsx("span", { className: "text-muted", children: "\u2192" })] }), _jsx("div", { className: "h-px bg-elevated" }), _jsxs("button", { onClick: () => setChangingPin(true), className: "w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: isPinSet() ? 'Change PIN' : 'Set PIN' }), _jsx("span", { className: "text-muted", children: "\u2192" })] })] }), changingPin && (_jsx("div", { className: "bg-surface rounded-card", children: _jsx(PinPad, { label: "Enter new PIN", onComplete: (pin) => {
                                setupPin(pin);
                                setChangingPin(false);
                            } }) })), _jsx("div", { className: "bg-surface rounded-card overflow-hidden mt-4", children: _jsxs("button", { onClick: logout, className: "w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: "Sign out" }), _jsx("span", { children: "\u2192" })] }) })] }), _jsx(BottomNav, {})] }));
}
