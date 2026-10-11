import type { BudgetRow } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export interface BudgetsResponse {
  month: string;
  baseCurrency: string;
  budgets: BudgetRow[];
}

export const budgetKeys = {
  all: ['budgets'] as const,
};

export function useBudgets() {
  return useQuery({
    queryKey: budgetKeys.all,
    queryFn: ({ signal }) => api.get<BudgetsResponse>('/budgets', signal),
  });
}
