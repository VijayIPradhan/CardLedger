import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { PinPad } from '../components/PinPad.js';
import { useUiStore } from '../store/uiStore.js';
import { setupPin, isPinSet, verifyPin } from '../lib/pin.js';

export default function AppLockScreen() {
  const [error, setError] = useState('');
  const unlock = useUiStore((s) => s.unlock);
  const nav = useNavigate();
  const pinSet = isPinSet();

  function handlePin(pin: string) {
    if (!pinSet) {
      setupPin(pin);
      unlock();
      nav('/', { replace: true });
      return;
    }
    if (verifyPin(pin)) {
      unlock();
      nav('/', { replace: true });
    } else {
      setError('Wrong PIN — try again');
    }
  }

  return (
    <Screen className="justify-center">
      <PinPad
        onComplete={handlePin}
        label={pinSet ? 'Enter PIN to unlock' : 'Set a 6-digit PIN'}
        error={error}
      />
    </Screen>
  );
}
