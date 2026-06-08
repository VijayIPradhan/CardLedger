// packages/app/src/components/BottomNav.tsx
import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/', label: 'Home', icon: '⬡' },
  { path: '/holders', label: 'Holders', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '◈' },
];

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex">
      {TABS.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
              active ? 'text-gold' : 'text-muted'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
            {active && <span className="w-4 h-0.5 rounded-full bg-gold" />}
          </Link>
        );
      })}
    </nav>
  );
}
