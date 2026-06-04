import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  back?: boolean;
  action?: React.ReactNode;
}

export function TopBar({ title, back, action }: TopBarProps) {
  const nav = useNavigate();
  return (
    <div className="flex items-center justify-between px-6 pt-12 pb-4">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={() => nav(-1)}
            className="text-muted hover:text-white transition-colors"
            aria-label="Go back"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <motion.h1
          className="text-2xl font-semibold tracking-tight"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {title}
        </motion.h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
