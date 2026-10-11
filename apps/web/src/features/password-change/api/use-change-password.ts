import type { ChangePasswordInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/entities/session';
import { api } from '@/shared/api';

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.post<{ revokedSessions: number }>('/auth/change-password', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.list }),
  });
}
