// packages/app/src/lib/permissions.ts
import { Sms } from '../plugins/SmsPlugin.js';

const SETUP_KEY = 'cl_sms_setup';

/** Returns true if the READ_SMS + RECEIVE_SMS runtime prompt has already been accepted. */
export function isSmsSetupDone(): boolean {
  return localStorage.getItem(SETUP_KEY) === 'done';
}

/**
 * Requests READ_SMS + RECEIVE_SMS in a single runtime prompt.
 * Call this ONCE from PermissionSetupScreen.
 * Returns true if granted, false if denied.
 */
export async function requestAllPermissions(): Promise<boolean> {
  const result = await Sms.requestPermissions();
  if (result.sms === 'granted') {
    localStorage.setItem(SETUP_KEY, 'done');
    return true;
  }
  return false;
}
