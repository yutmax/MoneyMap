import type { AccountResponse } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const accountKeys = {
  list: ['account', 'list'] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.list,
    queryFn: async ({ signal }) => {
      const { accounts } = await api.get<{ accounts: AccountResponse[] }>('/accounts', signal);
      return accounts;
    },
  });
}
