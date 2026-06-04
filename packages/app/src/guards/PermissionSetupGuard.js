import { jsx as _jsx } from "react/jsx-runtime";
// packages/app/src/guards/PermissionSetupGuard.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { isSmsSetupDone } from '../lib/permissions.js';
/** On Android, redirects to /setup-permissions until SMS permissions are granted. */
export function PermissionSetupGuard() {
    if (Capacitor.isNativePlatform() && !isSmsSetupDone()) {
        return _jsx(Navigate, { to: "/setup-permissions", replace: true });
    }
    return _jsx(Outlet, {});
}
