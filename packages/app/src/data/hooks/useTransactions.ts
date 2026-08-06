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

// holder_id_at_time is the optional "who used" override (manual entry)
export type CreateTransactionInput = Omit<
  Transaction,
  'id' | 'created_at' | 'holder_id_at_time' | 'is_paid' | 'raw_sms_encrypted' | 'dedupe_hash'
> & {
  holder_id_at_time?: string;
  is_paid?: boolean;
  raw_sms_encrypted?: string | null;
  dedupe_hash?: string | null;
};

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      api.post('/transactions', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Transaction> & { id: string }) =>
      api.patch(`/transactions/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
