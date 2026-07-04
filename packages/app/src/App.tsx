// packages/app/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard.js';
import { AppLockGuard } from './guards/AppLockGuard.js';
import LoginScreen from './screens/LoginScreen.js';
import HomeScreen from './screens/HomeScreen.js';
import AnalyticsScreen from './screens/AnalyticsScreen.js';
import CardDetailScreen from './screens/CardDetailScreen.js';
import HolderViewScreen from './screens/HolderViewScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';
import AppLockScreen from './screens/AppLockScreen.js';
import AddCardScreen from './screens/AddCardScreen.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<AuthGuard />}>
        <Route path="/lock" element={<AppLockScreen />} />
        <Route element={<AppLockGuard />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/analytics" element={<AnalyticsScreen />} />
          <Route path="/cards/new" element={<AddCardScreen />} />
          <Route path="/cards/:id" element={<CardDetailScreen />} />
          <Route path="/cards/:id/edit" element={<AddCardScreen />} />
          <Route path="/holders" element={<HolderViewScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
