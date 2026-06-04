import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Transaction } from '@cardledger/shared';

export function useTransactions(params?: { card_id?: string; holder_id?: string }) {
  return useQuery<Transaction[]>({
    queryKey: ['transactions', params],
    queryFn: () => api.get('/transactions', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Transaction, 'id' | 'created_at' | 'holder_id_at_time'>) =>
      api.post('/transactions', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
