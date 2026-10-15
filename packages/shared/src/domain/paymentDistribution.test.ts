import { describe, it, expect } from 'vitest';
import { distributePayment } from './paymentDistribution.js';

const bills = [
  { transaction_id: 'lic', remaining: 14321.6 },
  { transaction_id: 'oppo', remaining: 8481.4 },
];

describe('distributePayment', () => {
  it('settles bills exactly, with nothing left over', () => {
    expect(distributePayment(22803, bills)).toEqual({
      allocations: [
        { transaction_id: 'lic', amount: 14321.6 },
        { transaction_id: 'oppo', amount: 8481.4 },
      ],
      unallocated: 0,
    });
  });

  it('fills in the order given and stops when the money runs out', () => {
    expect(distributePayment(15000, bills)).toEqual({
      allocations: [
        { transaction_id: 'lic', amount: 14321.6 },
        { transaction_id: 'oppo', amount: 678.4 },
      ],
      unallocated: 0,
    });
  });

  it('leaves an overpayment unallocated', () => {
    expect(distributePayment(25000, bills).unallocated).toBe(2197);
  });

  it('leaves the whole payment unallocated when nothing is selected', () => {
    expect(distributePayment(6000, [])).toEqual({ allocations: [], unallocated: 6000 });
  });

  it('skips bills that owe nothing', () => {
    expect(
      distributePayment(100, [
        { transaction_id: 'paid', remaining: 0 },
        { transaction_id: 'open', remaining: 500 },
      ]).allocations,
    ).toEqual([{ transaction_id: 'open', amount: 100 }]);
  });
});
