import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../data/apiClient.js';

export function AuthGuard() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Outlet />;
}
