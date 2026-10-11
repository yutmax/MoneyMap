import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userKeys } from '@/entities/user';
import { api } from '@/shared/api';

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<{ ok: true }>('/auth/verify-email', { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.me }),
  });
}
