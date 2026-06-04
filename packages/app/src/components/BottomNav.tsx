// packages/app/src/components/BottomNav.tsx
import { Link, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useReviewStore } from '../store/reviewStore.js';

const WEB_TABS = [
  { path: '/', label: 'Home', icon: '⬡' },
  { path: '/holders', label: 'Holders', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '◈' },
];

const ANDROID_TABS = [...WEB_TABS, { path: '/sms', label: 'SMS', icon: '✉' }];

export function BottomNav() {
  const { pathname } = useLocation();
  const reviewCount = useReviewStore((s) => s.queue.length);
  const tabs = Capacitor.isNativePlatform() ? ANDROID_TABS : WEB_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex">
      {tabs.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
        const isSms = tab.path === '/sms';
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
              active ? 'text-gold' : 'text-muted'
            }`}
          >
            <span className="text-lg leading-none relative">
              {tab.icon}
              {isSms && reviewCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {reviewCount > 9 ? '9+' : reviewCount}
                </span>
              )}
            </span>
            <span>{tab.label}</span>
            {active && <span className="w-4 h-0.5 rounded-full bg-gold" />}
          </Link>
        );
      })}
    </nav>
  );
}
