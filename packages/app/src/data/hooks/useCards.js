import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
export function useCards() {
    return useQuery({
        queryKey: ['cards'],
        queryFn: () => api.get('/cards').then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });
}
export function useCard(id) {
    return useQuery({
        queryKey: ['cards', id],
        queryFn: () => api.get(`/cards/${id}`).then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });
}
export function useCreateCard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.post('/cards', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
    });
}
export function useUpdateCard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => api.patch(`/cards/${id}`, data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
    });
}
