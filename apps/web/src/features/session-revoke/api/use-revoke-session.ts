import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/entities/session';
import { api } from '@/shared/api';

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.delete<{ ok: true; wasCurrent: boolean }>(`/auth/sessions/${sessionId}`),
    onSuccess: (result) => {
      if (result.wasCurrent) {
        queryClient.clear();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list });
    },
  });
}

export function useLogoutOthers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/auth/logout-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.list }),
  });
}
