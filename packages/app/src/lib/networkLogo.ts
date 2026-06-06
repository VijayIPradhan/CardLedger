import visa from '../assets/networks/visa.svg';
import mastercard from '../assets/networks/mastercard.svg';
import rupay from '../assets/networks/rupay.svg';
import amex from '../assets/networks/amex.svg';
import generic from '../assets/networks/card-generic.svg';

const MAP: Record<string, string> = {
  Visa: visa,
  Mastercard: mastercard,
  RuPay: rupay,
  Amex: amex,
};

/** Returns the bundled logo URL for a network, or the generic card image. */
export function networkLogo(network: string | null | undefined): string {
  if (!network) return generic;
  return MAP[network] ?? generic;
}
