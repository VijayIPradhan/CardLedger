import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// packages/app/src/screens/SettingsScreen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { PinPad } from '../components/PinPad.js';
import { logout } from '../data/apiClient.js';
import { useUiStore } from '../store/uiStore.js';
import { isPinSet, setupPin } from '../lib/pin.js';
import { isBiometricEnabled, setBiometricEnabled } from '../lib/biometric.js';
export default function SettingsScreen() {
    const nav = useNavigate();
    const lock = useUiStore((s) => s.lock);
    const [changingPin, setChangingPin] = useState(false);
    const [biometricOn, setBiometricOn] = useState(isBiometricEnabled);
    function handleLockNow() {
        lock();
        nav('/lock', { replace: true });
    }
    function toggleBiometric() {
        const next = !biometricOn;
        setBiometricEnabled(next);
        setBiometricOn(next);
    }
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "Settings" }), _jsxs("div", { className: "px-4 flex flex-col gap-3", children: [_jsxs("div", { className: "bg-surface rounded-card overflow-hidden", children: [_jsxs("button", { onClick: handleLockNow, className: "w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: "Lock app now" }), _jsx("span", { className: "text-muted", children: "\u2192" })] }), _jsx("div", { className: "h-px bg-elevated" }), _jsxs("button", { onClick: () => setChangingPin(true), className: "w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: isPinSet() ? 'Change PIN' : 'Set PIN' }), _jsx("span", { className: "text-muted", children: "\u2192" })] }), Capacitor.isNativePlatform() && (_jsxs(_Fragment, { children: [_jsx("div", { className: "h-px bg-elevated" }), _jsxs("button", { onClick: toggleBiometric, className: "w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: "Biometric unlock" }), _jsx("span", { className: `w-10 h-6 rounded-full transition-colors flex items-center px-1 ${biometricOn ? 'bg-gold' : 'bg-elevated'}`, children: _jsx("span", { className: `w-4 h-4 rounded-full bg-white transition-transform ${biometricOn ? 'translate-x-4' : 'translate-x-0'}` }) })] })] }))] }), changingPin && (_jsx("div", { className: "bg-surface rounded-card", children: _jsx(PinPad, { label: "Enter new PIN", onComplete: (pin) => {
                                setupPin(pin);
                                setChangingPin(false);
                            } }) })), _jsx("div", { className: "bg-surface rounded-card overflow-hidden mt-4", children: _jsxs("button", { onClick: logout, className: "w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-elevated transition-colors", children: [_jsx("span", { className: "text-sm", children: "Sign out" }), _jsx("span", { children: "\u2192" })] }) })] }), _jsx(BottomNav, {})] }));
}
