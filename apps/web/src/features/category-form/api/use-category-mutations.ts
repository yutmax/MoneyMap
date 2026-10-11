import type {
  CategoryResponse,
  CreateCategoryInput,
  DeleteCategoryResult,
  UpdateCategoryInput,
} from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryKeys } from '@/entities/category';
import { api } from '@/shared/api';

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const { category } = await api.post<{ category: CategoryResponse }>('/categories', input);
      return category;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.list }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCategoryInput }) => {
      const { category } = await api.patch<{ category: CategoryResponse }>(
        `/categories/${id}`,
        input,
      );
      return category;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.list }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) =>
      api.delete<DeleteCategoryResult>(
        moveTo ? `/categories/${id}?moveTo=${moveTo}` : `/categories/${id}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.list });
      // Операции могли сменить категорию — их список тоже устарел.
      void queryClient.invalidateQueries({ queryKey: ['transaction'] });
    },
  });
}
