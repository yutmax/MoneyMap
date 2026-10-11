import type {
  CreateRecurringRuleInput,
  RecurringRuleResponse,
  UpdateRecurringRuleInput,
} from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { recurringKeys } from '@/entities/recurring';
import { transactionKeys } from '@/entities/transaction';
import { api } from '@/shared/api';

/**
 * После любого действия с правилом сбрасывается не только список правил.
 *
 * Создание правила, начинающегося сегодня, сразу создаёт операцию, а
 * подтверждение списания — тем более: баланс счёта и лента операций после
 * этого другие, и оставить их прежними на экране значит показать неправду.
 */
function useRecurringInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: recurringKeys.all });
    void queryClient.invalidateQueries({ queryKey: accountKeys.list });
    void queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  };
}

export function useCreateRecurringRule() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: async (input: CreateRecurringRuleInput) => {
      const { rule } = await api.post<{ rule: RecurringRuleResponse }>('/recurring-rules', input);
      return rule;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateRecurringRule() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateRecurringRuleInput }) => {
      const { rule } = await api.patch<{ rule: RecurringRuleResponse }>(
        `/recurring-rules/${id}`,
        input,
      );
      return rule;
    },
    onSuccess: invalidate,
  });
}

export function usePauseRecurringRule() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const { rule } = await api.post<{ rule: RecurringRuleResponse }>(
        `/recurring-rules/${id}/pause`,
        { paused },
      );
      return rule;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRecurringRule() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/recurring-rules/${id}`),
    onSuccess: invalidate,
  });
}

export function useConfirmOccurrence() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/recurring-occurrences/${id}/confirm`, {}),
    onSuccess: invalidate,
  });
}

export function useSkipOccurrence() {
  const invalidate = useRecurringInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/recurring-occurrences/${id}/skip`, {}),
    onSuccess: invalidate,
  });
}
