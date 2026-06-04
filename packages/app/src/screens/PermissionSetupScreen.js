import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/app/src/screens/PermissionSetupScreen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { requestAllPermissions } from '../lib/permissions.js';
export default function PermissionSetupScreen() {
    const nav = useNavigate();
    const [status, setStatus] = useState('idle');
    async function handleGrant() {
        setStatus('requesting');
        const granted = await requestAllPermissions();
        if (granted) {
            nav('/', { replace: true });
        }
        else {
            setStatus('denied');
        }
    }
    return (_jsx(Screen, { className: "justify-center px-6", children: _jsxs(motion.div, { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "flex flex-col items-center gap-6 text-center", children: [_jsx("span", { className: "text-5xl", children: "\uD83D\uDCAC" }), _jsx("h1", { className: "text-xl font-semibold", children: "Enable SMS Import" }), _jsx("p", { className: "text-muted text-sm leading-relaxed", children: "CardLedger reads your bank SMS messages to auto-import transactions. Your messages never leave this device." }), status === 'denied' && (_jsx("p", { className: "text-danger text-sm", children: "Permission denied. Please enable SMS access in Android Settings \u2192 Apps \u2192 CardLedger \u2192 Permissions." })), _jsx("button", { onClick: handleGrant, disabled: status === 'requesting', className: "w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50", children: status === 'requesting' ? 'Requesting…' : 'Grant SMS Access' }), _jsx("button", { onClick: () => nav('/', { replace: true }), className: "text-muted text-sm underline", children: "Skip for now" })] }) }));
}
