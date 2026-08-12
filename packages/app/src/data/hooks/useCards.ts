import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import { DASHBOARD_KEY } from './useDashboard.js';
import type { Card } from '@cardledger/shared';

export function useCards() {
  return useQuery<Card[]>({
    queryKey: ['cards'],
    queryFn: () => api.get('/cards').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCard(id: string) {
  return useQuery<Card>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/cards/${id}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Card, 'id' | 'created_at'>) =>
      api.post('/cards', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Card> & { id: string }) =>
      api.patch(`/cards/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cards/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
