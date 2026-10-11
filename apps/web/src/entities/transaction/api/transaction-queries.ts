import type { ListTransactionsQuery, TransactionPage } from '@moneymap/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export type TransactionFilters = Omit<Partial<ListTransactionsQuery>, 'cursor' | 'limit'>;

export const transactionKeys = {
  all: ['transaction'] as const,
  list: (filters: TransactionFilters) => ['transaction', 'list', filters] as const,
};

function toQueryString(filters: TransactionFilters, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Бесконечный список: курсорная пагинация (§10.3) ложится на
 * useInfiniteQuery один в один — у страницы есть курсор следующей,
 * и ничего, кроме него, для продолжения не нужно.
 */
export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      api.get<TransactionPage>(`/transactions${toQueryString(filters, pageParam)}`, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
