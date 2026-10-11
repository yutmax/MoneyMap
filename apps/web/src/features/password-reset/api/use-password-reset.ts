import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api';

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post<{ ok: true }>('/auth/forgot-password', { email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api.post<{ ok: true }>('/auth/reset-password', input),
  });
}
