import { motion } from 'framer-motion';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
}

export function Screen({ children, className = '' }: ScreenProps) {
  return (
    <motion.div
      className={`min-h-screen bg-base flex flex-col items-center`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`w-full max-w-7xl flex flex-col flex-1 relative ${className}`}>
        {children}
      </div>
    </motion.div>
  );
}
