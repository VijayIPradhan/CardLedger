import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { login } from '../data/apiClient.js';
import { Screen } from '../components/Screen.js';
export default function LoginScreen() {
    const nav = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username, password);
            nav('/', { replace: true });
        }
        catch {
            setError('Invalid username or password');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx(Screen, { className: "justify-center px-6", children: _jsxs(motion.div, { initial: { y: 32, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: 'spring', stiffness: 200, damping: 25 }, className: "w-full max-w-sm mx-auto", children: [_jsx("h1", { className: "text-3xl font-bold mb-2", children: "CardLedger" }), _jsx("p", { className: "text-muted mb-10", children: "Your cards. Your rules." }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-4", children: [_jsx("input", { value: username, onChange: (e) => setUsername(e.target.value), placeholder: "Username", autoComplete: "username", className: "bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Password", autoComplete: "current-password", className: "bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors" }), error && _jsx("p", { className: "text-sm text-danger", children: error }), _jsx("button", { type: "submit", disabled: loading, className: "bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50", children: loading ? 'Signing in…' : 'Sign in' })] })] }) }));
}
