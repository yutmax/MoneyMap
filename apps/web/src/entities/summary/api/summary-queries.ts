import type { NetWorthResponse, SummaryResponse } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export const summaryKeys = {
  all: ['summary'] as const,
  total: (baseCurrency?: string) => ['summary', 'total', baseCurrency ?? 'default'] as const,
  netWorth: (baseCurrency?: string) => ['summary', 'net-worth', baseCurrency ?? 'default'] as const,
};

function withBase(path: string, baseCurrency?: string): string {
  return baseCurrency ? `${path}?baseCurrency=${encodeURIComponent(baseCurrency)}` : path;
}

/**
 * Сводный баланс (§8.6).
 *
 * Валюта отображения входит в ключ запроса: смена валюты — это другой ответ
 * сервера, а не пересчёт на клиенте. Пересчитывать здесь означало бы держать
 * на фронтенде таблицу курсов и собственную денежную арифметику ради того,
 * что сервер уже посчитал.
 */
export function useSummary(baseCurrency?: string) {
  return useQuery({
    queryKey: summaryKeys.total(baseCurrency),
    queryFn: async ({ signal }) => {
      const { summary } = await api.get<{ summary: SummaryResponse }>(
        withBase('/summary', baseCurrency),
        signal,
      );
      return summary;
    },
    // Предыдущий ответ остаётся на экране, пока грузится новая валюта:
    // иначе крупная цифра мигала бы пустотой на каждое переключение.
    placeholderData: (previous) => previous,
  });
}

export function useNetWorth(baseCurrency?: string) {
  return useQuery({
    queryKey: summaryKeys.netWorth(baseCurrency),
    queryFn: ({ signal }) =>
      api.get<NetWorthResponse>(withBase('/summary/net-worth', baseCurrency), signal),
    placeholderData: (previous) => previous,
  });
}
