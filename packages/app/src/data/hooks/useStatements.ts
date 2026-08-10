import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Transaction } from '@cardledger/shared';

export function useUploadStatement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, file }: { cardId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/statements/upload?card_id=${cardId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      return data.transactions as Partial<Transaction>[];
    },
  });
}
