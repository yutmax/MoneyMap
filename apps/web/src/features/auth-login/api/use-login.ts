import type { LoginInput, MeResponse } from '@moneymap/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { sessionKeys } from '@/entities/session';
import { userKeys } from '@/entities/user';
import { api } from '@/shared/api';

export function useLogin(): UseMutationResult<MeResponse, Error, LoginInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { user } = await api.post<{ user: MeResponse }>('/auth/login', input);
      return user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.me, user);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list });
    },
  });
}
