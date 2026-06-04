import { Navigate, Outlet } from 'react-router-dom';
import { useUiStore } from '../store/uiStore.js';

export function AppLockGuard() {
  const locked = useUiStore((s) => s.locked);
  if (locked) return <Navigate to="/lock" replace />;
  return <Outlet />;
}
