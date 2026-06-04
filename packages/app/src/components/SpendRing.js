import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SpendRing({ spent, limit, size = 56 }) {
    const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const dash = circ * pct;
    return (_jsxs("svg", { width: size, height: size, className: "-rotate-90", children: [_jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "#1A1A1A", strokeWidth: "4" }), _jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "#C8A96E", strokeWidth: "4", strokeDasharray: `${dash} ${circ}`, strokeLinecap: "round", style: { transition: 'stroke-dasharray 0.6s ease' } })] }));
}
