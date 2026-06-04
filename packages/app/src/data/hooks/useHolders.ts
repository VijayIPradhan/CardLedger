import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Holder } from '@cardledger/shared';

export function useHolders() {
  return useQuery<Holder[]>({
    queryKey: ['holders'],
    queryFn: () => api.get('/holders').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateHolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Holder, 'id' | 'created_at'>) =>
      api.post('/holders', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holders'] }),
  });
}
