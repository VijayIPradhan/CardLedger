import { jsx as _jsx } from "react/jsx-runtime";
import { motion } from 'framer-motion';
export function Screen({ children, className = '' }) {
    return (_jsx(motion.div, { className: `min-h-screen bg-base flex flex-col ${className}`, initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 }, children: children }));
}
