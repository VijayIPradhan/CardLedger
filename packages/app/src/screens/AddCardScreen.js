import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCreateCard } from '../data/hooks/useCards.js';
const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex'];
const INPUT_CLS = 'w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors text-white';
export default function AddCardScreen() {
    const nav = useNavigate();
    const createCard = useCreateCard();
    const [form, setForm] = useState({
        last4: '',
        network: 'Visa',
        bank: '',
        nickname: '',
        billing_cycle_day: 1,
        payment_due_day: 20,
        credit_limit: 100000,
    });
    const [error, setError] = useState('');
    function setField(field, value) {
        setForm((f) => ({ ...f, [field]: value }));
    }
    async function submit(e) {
        e.preventDefault();
        setError('');
        try {
            await createCard.mutateAsync(form);
            nav('/', { replace: true });
        }
        catch {
            setError('Failed to save card — check all fields');
        }
    }
    return (_jsxs(Screen, { className: "pb-10", children: [_jsx(TopBar, { title: "Add Card", back: true }), _jsxs("form", { onSubmit: submit, className: "px-6 flex flex-col gap-4", children: [_jsx("input", { value: form.last4, onChange: (e) => setField('last4', e.target.value), placeholder: "Last 4 digits", maxLength: 4, className: INPUT_CLS }), _jsx("select", { value: form.network, onChange: (e) => setField('network', e.target.value), className: INPUT_CLS, children: NETWORKS.map((n) => (_jsx("option", { value: n, children: n }, n))) }), _jsx("input", { value: form.bank, onChange: (e) => setField('bank', e.target.value), placeholder: "Bank name", className: INPUT_CLS }), _jsx("input", { value: form.nickname, onChange: (e) => setField('nickname', e.target.value), placeholder: "Nickname (e.g. My HDFC)", className: INPUT_CLS }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "text-xs text-muted mb-1 block", children: "Billing cycle day" }), _jsx("input", { type: "number", min: 1, max: 28, value: form.billing_cycle_day, onChange: (e) => setField('billing_cycle_day', Number(e.target.value)), className: INPUT_CLS })] }), _jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "text-xs text-muted mb-1 block", children: "Payment due day" }), _jsx("input", { type: "number", min: 1, max: 28, value: form.payment_due_day, onChange: (e) => setField('payment_due_day', Number(e.target.value)), className: INPUT_CLS })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs text-muted mb-1 block", children: "Credit limit (\u20B9)" }), _jsx("input", { type: "number", value: form.credit_limit, onChange: (e) => setField('credit_limit', Number(e.target.value)), className: INPUT_CLS })] }), error && _jsx("p", { className: "text-sm text-danger", children: error }), _jsx("button", { type: "submit", disabled: createCard.isPending, className: "bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50", children: createCard.isPending ? 'Saving…' : 'Add Card' })] })] }));
}
