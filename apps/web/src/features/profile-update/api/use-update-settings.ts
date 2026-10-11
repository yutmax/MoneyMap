import type { MeResponse, UpdateSettingsInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userKeys } from '@/entities/user';
import { api } from '@/shared/api';

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) => {
      const { user } = await api.patch<{ user: MeResponse }>('/auth/me', input);
      return user;
    },
    onSuccess: (user) => queryClient.setQueryData(userKeys.me, user),
  });
}
