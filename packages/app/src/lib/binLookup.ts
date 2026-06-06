import { detectNetwork } from '@cardledger/shared';
import type { Network } from '@cardledger/shared';

export interface BinInfo {
  network: Network | null;
  bank: string | null;
  variant: string | null;
}

function mapScheme(scheme?: string): Network | null {
  switch ((scheme ?? '').toLowerCase()) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'Mastercard';
    case 'amex':
    case 'american express':
      return 'Amex';
    case 'rupay':
      return 'RuPay';
    default:
      return null;
  }
}

/**
 * Look up a BIN online (binlist.net), falling back to local network detection.
 * Never throws — always resolves to a BinInfo. Only the 6-digit BIN is sent.
 */
export async function lookupBin(bin: string): Promise<BinInfo> {
  const clean = bin.replace(/\D/g, '').slice(0, 6);
  const local: BinInfo = { network: detectNetwork(clean), bank: null, variant: null };
  if (clean.length < 6) return local;

  try {
    const res = await fetch(`https://lookup.binlist.net/${clean}`, {
      headers: { 'Accept-Version': '3' },
    });
    if (!res.ok) return local;
    const data = await res.json();
    const network = mapScheme(data?.scheme) ?? local.network;
    const bank: string | null = data?.bank?.name ?? null;
    const rawType = data?.type ? String(data.type) : '';
    const variant = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : null;
    return { network, bank, variant };
  } catch {
    return local;
  }
}
