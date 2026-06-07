import { useQuery } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { BankVariantMetadata } from '@cardledger/shared';

export function useBankMetadata() {
  return useQuery({
    queryKey: ['metadata', 'banks'],
    queryFn: async () => {
      const { data } = await api.get<BankVariantMetadata>('/metadata/banks');
      return data;
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours cache
  });
}
