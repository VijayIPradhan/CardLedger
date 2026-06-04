import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../data/apiClient.js';
export function AuthGuard() {
    if (!isAuthenticated())
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(Outlet, {});
}
