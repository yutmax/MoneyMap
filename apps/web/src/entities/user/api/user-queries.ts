import type { MeResponse } from '@moneymap/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/shared/api';

export const userKeys = {
  me: ['user', 'me'] as const,
};

export const meQuery = queryOptions({
  queryKey: userKeys.me,
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

/** Прошёл ли пользователь первичную настройку (§8.1). */
export function isOnboarded(user: MeResponse): boolean {
  return user.onboardedAt !== null;
}
