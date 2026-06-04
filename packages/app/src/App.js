import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginScreen, {}) }), _jsxs(Route, { element: _jsx(AuthGuard, {}), children: [_jsx(Route, { path: "/lock", element: _jsx(AppLockScreen, {}) }), _jsx(Route, { path: "/setup-permissions", element: _jsx(PermissionSetupScreen, {}) }), _jsx(Route, { element: _jsx(AppLockGuard, {}), children: _jsxs(Route, { element: _jsx(PermissionSetupGuard, {}), children: [_jsx(Route, { path: "/", element: _jsx(HomeScreen, {}) }), _jsx(Route, { path: "/cards/new", element: _jsx(AddCardScreen, {}) }), _jsx(Route, { path: "/cards/:id", element: _jsx(CardDetailScreen, {}) }), _jsx(Route, { path: "/holders", element: _jsx(HolderViewScreen, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsScreen, {}) }), _jsx(Route, { path: "/sms", element: _jsx(SmsImportScreen, {}) }), _jsx(Route, { path: "/sms/review", element: _jsx(ReviewQueueScreen, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) })] })] }));
}
