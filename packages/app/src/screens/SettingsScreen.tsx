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
import { useCards } from '../data/hooks/useCards.js';
import {
  isReminderEnabled,
  setReminderEnabled,
  getReminderDaysBefore,
  setReminderDaysBefore,
  scheduleDueReminders,
} from '../lib/notifications.js';
import type { Card } from '@cardledger/shared';

export default function SettingsScreen() {
  const nav = useNavigate();
  const lock = useUiStore((s) => s.lock);
  const { data: cards = [] } = useCards();
  const [changingPin, setChangingPin] = useState(false);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled);
  const [remindersOn, setRemindersOn] = useState(isReminderEnabled);
  const [daysBefore, setDaysBefore] = useState(getReminderDaysBefore);

  function handleLockNow() {
    lock();
    nav('/lock', { replace: true });
  }

  function toggleBiometric() {
    const next = !biometricOn;
    setBiometricEnabled(next);
    setBiometricOn(next);
  }

  function reschedule() {
    scheduleDueReminders(
      (cards as Card[]).map((c) => ({
        id: c.id,
        nickname: c.nickname,
        payment_due_day: c.payment_due_day,
      })),
    );
  }

  function toggleReminders() {
    const next = !remindersOn;
    setReminderEnabled(next);
    setRemindersOn(next);
    reschedule();
  }

  function changeDays(n: number) {
    setReminderDaysBefore(n);
    setDaysBefore(n);
    reschedule();
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
              <div className="h-px bg-elevated" />
              <button
                onClick={toggleReminders}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
              >
                <span className="text-sm">Due-date reminders</span>
                <span
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                    remindersOn ? 'bg-gold' : 'bg-elevated'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      remindersOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
              {remindersOn && (
                <div className="px-5 py-4 flex items-center justify-between">
                  <span className="text-sm text-muted">Remind days before</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => changeDays(n)}
                        className={`w-8 h-8 rounded-chip text-xs ${
                          daysBefore === n
                            ? 'bg-gold text-base font-semibold'
                            : 'bg-elevated text-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
