import type { AccountResponse, CreateAccountInput, UpdateAccountInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { api } from '@/shared/api';

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const { account } = await api.post<{ account: AccountResponse }>('/accounts', input);
      return account;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.list }),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateAccountInput }) => {
      const { account } = await api.patch<{ account: AccountResponse }>(`/accounts/${id}`, input);
      return account;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.list }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/accounts/${id}`),
    // Вместе со счётом уходят его операции, переводы, правила и лимит —
    // устаревает почти всё, что закешировано, поэтому сбрасывается весь кеш.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
