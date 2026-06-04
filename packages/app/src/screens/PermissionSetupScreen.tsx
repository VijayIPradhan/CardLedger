// packages/app/src/screens/PermissionSetupScreen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { requestAllPermissions } from '../lib/permissions.js';

export default function PermissionSetupScreen() {
  const nav = useNavigate();
  const [status, setStatus] = useState<'idle' | 'requesting' | 'denied'>('idle');

  async function handleGrant() {
    setStatus('requesting');
    const granted = await requestAllPermissions();
    if (granted) {
      nav('/', { replace: true });
    } else {
      setStatus('denied');
    }
  }

  return (
    <Screen className="justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <span className="text-5xl">💬</span>
        <h1 className="text-xl font-semibold">Enable SMS Import</h1>
        <p className="text-muted text-sm leading-relaxed">
          CardLedger reads your bank SMS messages to auto-import transactions. Your messages never
          leave this device.
        </p>

        {status === 'denied' && (
          <p className="text-danger text-sm">
            Permission denied. Please enable SMS access in Android Settings → Apps → CardLedger →
            Permissions.
          </p>
        )}

        <button
          onClick={handleGrant}
          disabled={status === 'requesting'}
          className="w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50"
        >
          {status === 'requesting' ? 'Requesting…' : 'Grant SMS Access'}
        </button>

        <button
          onClick={() => nav('/', { replace: true })}
          className="text-muted text-sm underline"
        >
          Skip for now
        </button>
      </motion.div>
    </Screen>
  );
}
