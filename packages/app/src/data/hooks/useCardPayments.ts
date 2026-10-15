import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateCardPaymentInput, Transaction } from '@cardledger/shared';
import { api } from '../apiClient.js';
import { DASHBOARD_KEY } from './useDashboard.js';

/**
 * Records one payment to a card's bank. The server splits it across `transaction_ids` (in
 * order, each up to what it still owes) and keeps any rest unallocated, all in one request.
 * The response is the payment as GET /transactions lists it.
 */
export function useCreateCardPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCardPaymentInput) =>
      api.post<Transaction>('/card-payments', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
