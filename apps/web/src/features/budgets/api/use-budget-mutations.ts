import type { CreateBudgetInput, UpdateBudgetInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { budgetKeys, type BudgetsResponse } from './budget-queries.ts';

/**
 * Каждый бюджет меняется сам по себе: своя сумма, своё удаление.
 *
 * Все три ответа — это уже пересчитанный список целиком, поэтому он кладётся
 * в кеш как есть. Инвалидация вместо этого стоила бы ещё одного GET за теми
 * же данными, которые сервер только что посчитал.
 */
function useBudgetWrite<TInput>(call: (input: TInput) => Promise<BudgetsResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (data) => queryClient.setQueryData(budgetKeys.all, data),
  });
}

export function useCreateBudget() {
  return useBudgetWrite((input: CreateBudgetInput) => api.post<BudgetsResponse>('/budgets', input));
}

export function useUpdateBudget() {
  return useBudgetWrite(({ id, input }: { id: string; input: UpdateBudgetInput }) =>
    api.patch<BudgetsResponse>(`/budgets/${id}`, input),
  );
}

export function useDeleteBudget() {
  return useBudgetWrite((id: string) => api.delete<BudgetsResponse>(`/budgets/${id}`));
}
