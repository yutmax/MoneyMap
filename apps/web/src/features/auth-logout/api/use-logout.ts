import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    // Неважно, чем кончился запрос: локальный кеш в любом случае больше
    // не отражает состояние сервера.
    onSettled: () => queryClient.clear(),
  });
}
