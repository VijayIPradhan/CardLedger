import { motion } from 'framer-motion';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
}

export function Screen({ children, className = '' }: ScreenProps) {
  return (
    <motion.div
      className={`min-h-screen bg-base flex flex-col ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
