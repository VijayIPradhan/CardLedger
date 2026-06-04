// packages/shared/src/sms/dedupeHash.ts
import type { SmsInput } from './types.js';

export async function dedupeHash(input: SmsInput): Promise<string> {
  const raw = `${input.sender}|${input.body}|${input.timestamp ?? 0}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
