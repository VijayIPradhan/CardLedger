// packages/app/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard.js';
import { AppLockGuard } from './guards/AppLockGuard.js';
import { PermissionSetupGuard } from './guards/PermissionSetupGuard.js';
import LoginScreen from './screens/LoginScreen.js';
import HomeScreen from './screens/HomeScreen.js';
import CardDetailScreen from './screens/CardDetailScreen.js';
import HolderViewScreen from './screens/HolderViewScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';
import AppLockScreen from './screens/AppLockScreen.js';
import AddCardScreen from './screens/AddCardScreen.js';
import PermissionSetupScreen from './screens/PermissionSetupScreen.js';
import SmsImportScreen from './screens/SmsImportScreen.js';
import ReviewQueueScreen from './screens/ReviewQueueScreen.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<AuthGuard />}>
        <Route path="/lock" element={<AppLockScreen />} />
        <Route path="/setup-permissions" element={<PermissionSetupScreen />} />
        <Route element={<AppLockGuard />}>
          <Route element={<PermissionSetupGuard />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/cards/new" element={<AddCardScreen />} />
            <Route path="/cards/:id" element={<CardDetailScreen />} />
            <Route path="/holders" element={<HolderViewScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/sms" element={<SmsImportScreen />} />
            <Route path="/sms/review" element={<ReviewQueueScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
