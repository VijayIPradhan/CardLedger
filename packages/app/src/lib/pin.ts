const STORAGE_KEY = 'cl_pin_hash';

function hashPin(pin: string): string {
  return btoa(pin + 'cl-salt-v1');
}

export function setupPin(pin: string): void {
  localStorage.setItem(STORAGE_KEY, hashPin(pin));
}

export function isPinSet(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function verifyPin(pin: string): boolean {
  return hashPin(pin) === localStorage.getItem(STORAGE_KEY);
}
