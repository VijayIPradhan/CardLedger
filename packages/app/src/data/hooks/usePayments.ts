import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Payment } from '@cardledger/shared';
import { DASHBOARD_KEY } from './useDashboard.js';

type CreatePaymentInput = {
  holder_id: string;
  amount: number;
  payment_date: string;
  notes?: string;
  /** Links the cash to a specific transaction, which is what lets it reduce per-card debt. */
  transaction_id?: string;
};

export function usePayments(holderId?: string) {
  return useQuery({
    queryKey: ['payments', holderId],
    queryFn: async () => {
      const url = holderId ? `/payments?holder_id=${holderId}` : '/payments';
      const { data } = await api.get<Payment[]>(url);
      return data;
    },
    enabled: true,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePaymentInput) => {
      const res = await api.post<Payment>('/payments', data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['payments', variables.holder_id] });
      queryClient.invalidateQueries({ queryKey: ['payments', undefined] });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
