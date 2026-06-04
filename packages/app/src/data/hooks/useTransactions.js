import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
export function useTransactions(params) {
    return useQuery({
        queryKey: ['transactions', params],
        queryFn: () => api.get('/transactions', { params }).then((r) => r.data),
        staleTime: 30 * 1000,
    });
}
export function useCreateTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.post('/transactions', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
    });
}
