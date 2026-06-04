// packages/app/src/screens/SettingsScreen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { PinPad } from '../components/PinPad.js';
import { logout } from '../data/apiClient.js';
import { useUiStore } from '../store/uiStore.js';
import { isPinSet, setupPin } from '../lib/pin.js';
import { isBiometricEnabled, setBiometricEnabled } from '../lib/biometric.js';

export default function SettingsScreen() {
  const nav = useNavigate();
  const lock = useUiStore((s) => s.lock);
  const [changingPin, setChangingPin] = useState(false);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled);

  function handleLockNow() {
    lock();
    nav('/lock', { replace: true });
  }

  function toggleBiometric() {
    const next = !biometricOn;
    setBiometricEnabled(next);
    setBiometricOn(next);
  }

  return (
    <Screen className="pb-24">
      <TopBar title="Settings" />
      <div className="px-4 flex flex-col gap-3">
        <div className="bg-surface rounded-card overflow-hidden">
          <button
            onClick={handleLockNow}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
          >
            <span className="text-sm">Lock app now</span>
            <span className="text-muted">→</span>
          </button>
          <div className="h-px bg-elevated" />
          <button
            onClick={() => setChangingPin(true)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
          >
            <span className="text-sm">{isPinSet() ? 'Change PIN' : 'Set PIN'}</span>
            <span className="text-muted">→</span>
          </button>
          {Capacitor.isNativePlatform() && (
            <>
              <div className="h-px bg-elevated" />
              <button
                onClick={toggleBiometric}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
              >
                <span className="text-sm">Biometric unlock</span>
                <span
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                    biometricOn ? 'bg-gold' : 'bg-elevated'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      biometricOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </>
          )}
        </div>

        {changingPin && (
          <div className="bg-surface rounded-card">
            <PinPad
              label="Enter new PIN"
              onComplete={(pin) => {
                setupPin(pin);
                setChangingPin(false);
              }}
            />
          </div>
        )}

        <div className="bg-surface rounded-card overflow-hidden mt-4">
          <button
            onClick={logout}
            className="w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-elevated transition-colors"
          >
            <span className="text-sm">Sign out</span>
            <span>→</span>
          </button>
        </div>
      </div>
      <BottomNav />
    </Screen>
  );
}
