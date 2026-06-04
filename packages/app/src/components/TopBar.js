import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
export function TopBar({ title, back, action }) {
    const nav = useNavigate();
    return (_jsxs("div", { className: "flex items-center justify-between px-6 pt-12 pb-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [back && (_jsx("button", { onClick: () => nav(-1), className: "text-muted hover:text-white transition-colors", "aria-label": "Go back", children: _jsx("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M19 12H5M12 5l-7 7 7 7" }) }) })), _jsx(motion.h1, { className: "text-2xl font-semibold tracking-tight", initial: { y: -8, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, children: title })] }), action && _jsx("div", { children: action })] }));
}
