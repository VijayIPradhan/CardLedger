import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard.js';
import { AppLockGuard } from './guards/AppLockGuard.js';
import LoginScreen from './screens/LoginScreen.js';
import HomeScreen from './screens/HomeScreen.js';
import CardDetailScreen from './screens/CardDetailScreen.js';
import HolderViewScreen from './screens/HolderViewScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';
import AppLockScreen from './screens/AppLockScreen.js';
import AddCardScreen from './screens/AddCardScreen.js';
export default function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginScreen, {}) }), _jsxs(Route, { element: _jsx(AuthGuard, {}), children: [_jsx(Route, { path: "/lock", element: _jsx(AppLockScreen, {}) }), _jsxs(Route, { element: _jsx(AppLockGuard, {}), children: [_jsx(Route, { path: "/", element: _jsx(HomeScreen, {}) }), _jsx(Route, { path: "/cards/new", element: _jsx(AddCardScreen, {}) }), _jsx(Route, { path: "/cards/:id", element: _jsx(CardDetailScreen, {}) }), _jsx(Route, { path: "/holders", element: _jsx(HolderViewScreen, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsScreen, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] })] })] }));
}
