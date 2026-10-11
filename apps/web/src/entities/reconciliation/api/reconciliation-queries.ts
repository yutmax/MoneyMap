import type {
  NotificationResponse,
  ReconciliationRow,
  ReminderResponse,
  SnapshotResponse,
} from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  accounts: ['reconciliation', 'accounts'] as const,
  snapshots: ['reconciliation', 'snapshots'] as const,
  reminders: ['reminders'] as const,
  notifications: ['notifications'] as const,
};

/** Счета с расчётным остатком и датой последней сверки (§8.8). */
export function useReconciliationAccounts() {
  return useQuery({
    queryKey: reconciliationKeys.accounts,
    queryFn: async ({ signal }) => {
      const { accounts } = await api.get<{ accounts: ReconciliationRow[] }>(
        '/snapshots/accounts',
        signal,
      );
      return accounts;
    },
  });
}

export function useSnapshots() {
  return useQuery({
    queryKey: reconciliationKeys.snapshots,
    queryFn: async ({ signal }) => {
      const { snapshots } = await api.get<{ snapshots: SnapshotResponse[] }>('/snapshots', signal);
      return snapshots;
    },
  });
}

export function useReminders() {
  return useQuery({
    queryKey: reconciliationKeys.reminders,
    queryFn: async ({ signal }) => {
      const { reminders } = await api.get<{ reminders: ReminderResponse[] }>('/reminders', signal);
      return reminders;
    },
  });
}

/**
 * Внутренние уведомления (§8.8).
 *
 * Без опроса по таймеру: напоминание приходит раз в месяц, и держать ради
 * него постоянный запрос — несоразмерная плата. Список обновляется при
 * открытии приложения, чего для месячного события достаточно.
 */
export function useNotifications() {
  return useQuery({
    queryKey: reconciliationKeys.notifications,
    queryFn: async ({ signal }) => {
      const { notifications } = await api.get<{ notifications: NotificationResponse[] }>(
        '/notifications',
        signal,
      );
      return notifications;
    },
  });
}
