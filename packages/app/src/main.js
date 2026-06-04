import { jsx as _jsx } from "react/jsx-runtime";
// packages/app/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useUiStore } from './store/uiStore.js';
import AppRoot from './App.js';
import './styles/globals.css';
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
// 5-minute background lock (Android only)
if (Capacitor.isNativePlatform()) {
    let bgTimestamp = null;
    const LOCK_AFTER_MS = 5 * 60 * 1000;
    App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
            bgTimestamp = Date.now();
        }
        else {
            if (bgTimestamp !== null && Date.now() - bgTimestamp > LOCK_AFTER_MS) {
                useUiStore.getState().lock();
            }
            bgTimestamp = null;
        }
    });
}
const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 5 * 60 * 1000, retry: 2 },
    },
});
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsx(AppRoot, {}) }) }) }));
