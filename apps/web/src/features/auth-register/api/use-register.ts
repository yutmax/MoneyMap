import type { MeResponse, RegisterInput } from '@moneymap/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { userKeys } from '@/entities/user';
import { api } from '@/shared/api';

export function useRegister(): UseMutationResult<MeResponse, Error, RegisterInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { user } = await api.post<{ user: MeResponse }>('/auth/register', input);
      return user;
    },
    onSuccess: (user) => queryClient.setQueryData(userKeys.me, user),
  });
}
