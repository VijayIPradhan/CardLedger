import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/app/src/screens/AppLockScreen.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Screen } from '../components/Screen.js';
import { PinPad } from '../components/PinPad.js';
import { useUiStore } from '../store/uiStore.js';
import { setupPin, isPinSet, verifyPin } from '../lib/pin.js';
import { unlockWithBiometric, isBiometricEnabled } from '../lib/biometric.js';
export default function AppLockScreen() {
    const [error, setError] = useState('');
    const [showPin, setShowPin] = useState(false);
    const unlock = useUiStore((s) => s.unlock);
    const nav = useNavigate();
    const pinSet = isPinSet();
    // On Android, attempt biometric unlock immediately on mount
    useEffect(() => {
        if (!Capacitor.isNativePlatform() || !isBiometricEnabled() || !pinSet) {
            setShowPin(true);
            return;
        }
        unlockWithBiometric().then((outcome) => {
            if (outcome === 'success') {
                unlock();
                nav('/', { replace: true });
            }
            else {
                // 'fallback' or 'unavailable' → show PIN pad
                setShowPin(true);
            }
        });
    }, []);
    function handlePin(pin) {
        if (!pinSet) {
            setupPin(pin);
            unlock();
            nav('/', { replace: true });
            return;
        }
        if (verifyPin(pin)) {
            unlock();
            nav('/', { replace: true });
        }
        else {
            setError('Wrong PIN — try again');
        }
    }
    if (!showPin) {
        // Biometric attempt in progress — show nothing (or a brief spinner)
        return (_jsx(Screen, { className: "justify-center items-center", children: _jsx("span", { className: "text-muted text-sm", children: "Authenticating\u2026" }) }));
    }
    return (_jsxs(Screen, { className: "justify-center", children: [_jsx(PinPad, { onComplete: handlePin, label: pinSet ? 'Enter PIN to unlock' : 'Set a 6-digit PIN', error: error }), Capacitor.isNativePlatform() && isBiometricEnabled() && pinSet && (_jsx("button", { className: "mt-4 text-gold text-sm underline", onClick: () => unlockWithBiometric().then((o) => {
                    if (o === 'success') {
                        unlock();
                        nav('/', { replace: true });
                    }
                }), children: "Use biometric" }))] }));
}
