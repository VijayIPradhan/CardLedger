import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import { DASHBOARD_KEY } from './useDashboard.js';
import type { Assignment } from '@cardledger/shared';

export function useAssignments(cardId?: string) {
  return useQuery<Assignment[]>({
    queryKey: ['assignments', cardId],
    queryFn: () =>
      api
        .get('/assignments', { params: cardId ? { card_id: cardId } : undefined })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveAssignment(cardId: string) {
  return useQuery<Assignment | undefined>({
    queryKey: ['assignments', cardId, 'active'],
    queryFn: () =>
      api
        .get('/assignments', { params: { card_id: cardId, active: 'true' } })
        .then((r) => r.data[0]),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Pick<Assignment, 'card_id' | 'holder_id' | 'handed_over_date'>) =>
      api.post('/assignments', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useReturnCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      api
        .patch(`/assignments/${assignmentId}`, {
          returned_date: new Date().toISOString().split('T')[0],
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
