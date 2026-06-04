import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
export function useAssignments(cardId) {
    return useQuery({
        queryKey: ['assignments', cardId],
        queryFn: () => api.get('/assignments', { params: cardId ? { card_id: cardId } : undefined }).then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });
}
export function useActiveAssignment(cardId) {
    return useQuery({
        queryKey: ['assignments', cardId, 'active'],
        queryFn: () => api
            .get('/assignments', { params: { card_id: cardId, active: 'true' } })
            .then((r) => r.data[0]),
        staleTime: 5 * 60 * 1000,
    });
}
export function useCreateAssignment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.post('/assignments', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
    });
}
export function useReturnCard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (assignmentId) => api.post(`/assignments/${assignmentId}/return`).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
    });
}
