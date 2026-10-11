import type {
  CreateSnapshotInput,
  ReminderResponse,
  SnapshotResponse,
  UpdateReminderInput,
} from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { reconciliationKeys } from '@/entities/reconciliation';
import { transactionKeys } from '@/entities/transaction';
import { api } from '@/shared/api';

/**
 * Корректировка — обычная операция, поэтому после неё устаревают и баланс
 * счёта, и лента операций, и сам экран сверки: расчётный остаток после
 * корректировки другой.
 */
function useReconciliationInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    void queryClient.invalidateQueries({ queryKey: accountKeys.list });
    void queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  };
}

export function useCreateSnapshot() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: async (input: CreateSnapshotInput) => {
      const { snapshot } = await api.post<{ snapshot: SnapshotResponse }>('/snapshots', input);
      return snapshot;
    },
    onSuccess: invalidate,
  });
}

export function useCorrectSnapshot() {
  const invalidate = useReconciliationInvalidation();
  return useMutation({
    mutationFn: async (id: string) => {
      const { snapshot } = await api.post<{ snapshot: SnapshotResponse }>(
        `/snapshots/${id}/correct`,
        {},
      );
      return snapshot;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateReminderInput }) => {
      const { reminder } = await api.put<{ reminder: ReminderResponse }>(`/reminders/${id}`, input);
      return reminder;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reconciliationKeys.reminders }),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reconciliationKeys.notifications }),
  });
}
