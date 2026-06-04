import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
export function useHolders() {
    return useQuery({
        queryKey: ['holders'],
        queryFn: () => api.get('/holders').then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });
}
export function useCreateHolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.post('/holders', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['holders'] }),
    });
}
