// packages/app/src/lib/biometric.ts
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
const PREF_KEY = 'cl_biometric_enabled';
/** Returns the stored user preference (default true on first run). */
export function isBiometricEnabled() {
    const stored = localStorage.getItem(PREF_KEY);
    return stored === null ? true : stored === 'true';
}
/** Persist the user's preference. */
export function setBiometricEnabled(enabled) {
    localStorage.setItem(PREF_KEY, String(enabled));
}
/**
 * Attempts biometric authentication.
 * - 'success'     → fingerprint/face matched
 * - 'fallback'    → user cancelled or tapped "Use PIN"
 * - 'unavailable' → hardware not present / not enrolled
 */
export async function unlockWithBiometric() {
    const { isAvailable } = await BiometricAuth.checkBiometry();
    if (!isAvailable)
        return 'unavailable';
    try {
        await BiometricAuth.authenticate({
            reason: 'Unlock CardLedger',
            cancelTitle: 'Use PIN',
            allowDeviceCredential: false,
        });
        return 'success';
    }
    catch {
        // User cancelled, tapped Use PIN, or auth failed after retries
        return 'fallback';
    }
}
