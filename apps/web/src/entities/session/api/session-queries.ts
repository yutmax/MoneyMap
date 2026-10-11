import type { SessionSummary } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const sessionKeys = {
  list: ['session', 'list'] as const,
};

export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.list,
    queryFn: async ({ signal }) => {
      const { sessions } = await api.get<{ sessions: SessionSummary[] }>('/auth/sessions', signal);
      return sessions;
    },
    staleTime: 15_000,
  });
}
