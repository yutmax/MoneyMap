import type {
  PendingOccurrence,
  RecurringRuleResponse,
  UpcomingOccurrence,
} from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const recurringKeys = {
  all: ['recurring'] as const,
  rules: ['recurring', 'rules'] as const,
  upcoming: (days: number) => ['recurring', 'upcoming', days] as const,
  pending: ['recurring', 'pending'] as const,
};

export function useRecurringRules() {
  return useQuery({
    queryKey: recurringKeys.rules,
    queryFn: async ({ signal }) => {
      const { rules } = await api.get<{ rules: RecurringRuleResponse[] }>(
        '/recurring-rules',
        signal,
      );
      return rules;
    },
  });
}

export function useUpcoming(days = 30) {
  return useQuery({
    queryKey: recurringKeys.upcoming(days),
    queryFn: async ({ signal }) => {
      const { upcoming } = await api.get<{ upcoming: UpcomingOccurrence[] }>(
        `/recurring-rules/upcoming?days=${days}`,
        signal,
      );
      return upcoming;
    },
  });
}

/**
 * Очередь подтверждений (§8.7).
 *
 * Список наполняет догоняющая генерация, которая идёт фоном при входе,
 * поэтому сразу после входа он может быть ещё пустым. Это не повод
 * опрашивать сервер по таймеру: очередь не срочная, и к следующему
 * открытию страницы всё уже на месте.
 */
export function usePendingOccurrences() {
  return useQuery({
    queryKey: recurringKeys.pending,
    queryFn: async ({ signal }) => {
      const { pending } = await api.get<{ pending: PendingOccurrence[] }>(
        '/recurring-occurrences/pending',
        signal,
      );
      return pending;
    },
  });
}
