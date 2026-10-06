import type {
  ChangePasswordInput,
  LoginInput,
  MeResponse,
  RegisterInput,
  SessionSummary,
  UpdateSettingsInput,
} from '@moneymap/shared';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { api, ApiError } from './client.ts';

export interface Currency {
  code: string;
  kind: 'fiat' | 'crypto';
  decimals: number;
  symbol: string;
  name: string;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
  currencies: ['currencies'] as const,
};

/* ──────────────────────────────── запросы ───────────────────────────────── */

export const meQuery = queryOptions({
  queryKey: authKeys.me,
  queryFn: async ({ signal }) => {
    const { user } = await api.get<{ user: MeResponse }>('/auth/me', signal);
    return user;
  },
  // 401 здесь — не ошибка, а «пользователь не вошёл»: повторять бессмысленно.
  retry: (failureCount, error) =>
    !(error instanceof ApiError && error.isUnauthorized) && failureCount < 2,
  staleTime: 60_000,
});

/**
 * `undefined` — ещё грузится, `null` — точно не вошёл, объект — вошёл.
 * Три состояния вместо двух: иначе роутер успевает отправить на /login
 * того, кто на самом деле авторизован.
 */
export function useMe() {
  const query = useQuery(meQuery);
  const isUnauthenticated = query.error instanceof ApiError && query.error.isUnauthorized;

  return {
    user: isUnauthenticated ? null : (query.data ?? undefined),
    isLoading: query.isPending,
    isError: query.isError && !isUnauthenticated,
    error: query.error,
  };
}

export function useCurrencies() {
  return useQuery({
    queryKey: authKeys.currencies,
    queryFn: async ({ signal }) => {
      const { currencies } = await api.get<{ currencies: Currency[] }>('/currencies', signal);
      return currencies;
    },
    // Справочник валют меняется с релизами, а не в течение сессии.
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: authKeys.sessions,
    queryFn: async ({ signal }) => {
      const { sessions } = await api.get<{ sessions: SessionSummary[] }>('/auth/sessions', signal);
      return sessions;
    },
    staleTime: 15_000,
  });
}

/* ─────────────────────────────── мутации ────────────────────────────────── */

export function useLogin(): UseMutationResult<MeResponse, Error, LoginInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { user } = await api.post<{ user: MeResponse }>('/auth/login', input);
      return user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions });
    },
  });
}

export function useRegister(): UseMutationResult<MeResponse, Error, RegisterInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { user } = await api.post<{ user: MeResponse }>('/auth/register', input);
      return user;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    // Неважно, чем кончился запрос: локальный кеш в любом случае больше
    // не отражает состояние сервера.
    onSettled: () => queryClient.clear(),
  });
}

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
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions });
    },
  });
}

export function useLogoutOthers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/auth/logout-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions }),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.post<{ revokedSessions: number }>('/auth/change-password', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions }),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) => {
      const { user } = await api.patch<{ user: MeResponse }>('/auth/me', input);
      return user;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

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

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<{ ok: true }>('/auth/verify-email', { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  });
}
