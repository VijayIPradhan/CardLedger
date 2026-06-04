import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet } from 'react-router-dom';
import { useUiStore } from '../store/uiStore.js';
export function AppLockGuard() {
    const locked = useUiStore((s) => s.locked);
    if (locked)
        return _jsx(Navigate, { to: "/lock", replace: true });
    return _jsx(Outlet, {});
}
