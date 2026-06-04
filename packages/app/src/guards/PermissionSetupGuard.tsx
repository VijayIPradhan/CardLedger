// packages/app/src/guards/PermissionSetupGuard.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { isSmsSetupDone } from '../lib/permissions.js';

/** On Android, redirects to /setup-permissions until SMS permissions are granted. */
export function PermissionSetupGuard() {
  if (Capacitor.isNativePlatform() && !isSmsSetupDone()) {
    return <Navigate to="/setup-permissions" replace />;
  }
  return <Outlet />;
}
