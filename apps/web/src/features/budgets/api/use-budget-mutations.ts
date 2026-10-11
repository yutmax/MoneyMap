import type { SetBudgetsInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { budgetKeys, type BudgetsResponse } from './budget-queries.ts';

export function useSetBudgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBudgetsInput) => api.put<BudgetsResponse>('/budgets', input),
    // Ответ уже содержит пересчитанный список — кладём его в кеш вместо
    // повторного запроса за тем же самым.
    onSuccess: (data) => queryClient.setQueryData(budgetKeys.all, data),
  });
}
