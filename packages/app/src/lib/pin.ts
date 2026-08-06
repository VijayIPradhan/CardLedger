const STORAGE_KEY = 'cl_pin_hash';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'cl-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function setupPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  localStorage.setItem(STORAGE_KEY, hash);
}

export function isPinSet(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const hash = await hashPin(pin);
  return hash === localStorage.getItem(STORAGE_KEY);
}
