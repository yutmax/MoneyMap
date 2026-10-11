import type { CategoryResponse } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const categoryKeys = {
  list: ['category', 'list'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.list,
    queryFn: async ({ signal }) => {
      const { categories } = await api.get<{ categories: CategoryResponse[] }>(
        '/categories',
        signal,
      );
      return categories;
    },
  });
}
