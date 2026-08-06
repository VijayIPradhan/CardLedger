import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { CardPayment } from '@cardledger/shared';

export function useCardPayments(cardId: string) {
  return useQuery({
    queryKey: ['card-payments', cardId],
    queryFn: async () => {
      const res = await api.get(`/card-payments?card_id=${cardId}`);
      return res.data as CardPayment[];
    },
    enabled: !!cardId,
  });
}

export function useCreateCardPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      card_id: string;
      amount: number;
      payment_date: string;
      notes?: string | null;
    }) => {
      const res = await api.post('/card-payments', data);
      return res.data as CardPayment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['card-payments', variables.card_id] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useUpdateCardPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      card_id?: string;
      amount?: number;
      payment_date?: string;
      notes?: string | null;
    }) => {
      const res = await api.patch(`/card-payments/${id}`, data);
      return res.data as CardPayment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['card-payments', data.card_id] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

export function useDeleteCardPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/card-payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card-payments'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}
