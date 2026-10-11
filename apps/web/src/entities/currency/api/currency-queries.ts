import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';
import type { Currency } from '../model/types.ts';

export const currencyKeys = {
  list: ['currency', 'list'] as const,
};

export function useCurrencies() {
  return useQuery({
    queryKey: currencyKeys.list,
    queryFn: async ({ signal }) => {
      const { currencies } = await api.get<{ currencies: Currency[] }>('/currencies', signal);
      return currencies;
    },
    // Справочник валют меняется с релизами, а не в течение сессии.
    staleTime: 24 * 60 * 60 * 1000,
  });
}
