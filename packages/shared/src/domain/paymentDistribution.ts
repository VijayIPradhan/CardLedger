/**
 * Splits one bank payment across the transactions it is meant to settle.
 *
 * Bills are filled in the order given, each up to what it still owes, until the money runs out;
 * whatever is left is unallocated (an overpayment, or a payment with nothing selected). Same
 * rule as PaymentDistribution.kt, which the Android sheet uses to preview the split; the server
 * applies this one.
 *
 * Works in whole paise so that 14321.60 + 8481.40 is exactly 22803.00 and a fully covered bill
 * is never left owing a fraction of a paisa.
 */

export interface BillToSettle {
  transaction_id: string;
  /** What the transaction still owes: its amount less what is already allocated to it. */
  remaining: number;
}

export interface DistributedPayment {
  allocations: Array<{ transaction_id: string; amount: number }>;
  unallocated: number;
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

export function distributePayment(amount: number, bills: BillToSettle[]): DistributedPayment {
  let left = Math.max(0, toPaise(amount));
  const allocations: DistributedPayment['allocations'] = [];
  for (const bill of bills) {
    if (left === 0) break;
    const take = Math.min(left, Math.max(0, toPaise(bill.remaining)));
    if (take === 0) continue;
    allocations.push({ transaction_id: bill.transaction_id, amount: take / 100 });
    left -= take;
  }
  return { allocations, unallocated: left / 100 };
}
