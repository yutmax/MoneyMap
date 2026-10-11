import type { ConvertResponse } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

interface ConvertArgs {
  from: string;
  to: string;
  amount: string;
  /** Дата курса. Пустая — курс на сегодня. */
  on?: string;
}

export const rateKeys = {
  convert: (args: ConvertArgs) =>
    ['rate', 'convert', args.from, args.to, args.amount, args.on ?? 'today'] as const,
};

/**
 * Пересчёт суммы по курсу (§8.5).
 *
 * Считает сервер, а не клиент: курс лежит в его таблице, а денежная
 * арифметика — в общем пакете, который на клиенте пришлось бы кормить
 * теми же данными. Здесь результат нужен как подсказка к полю ввода.
 */
export function useConvert(args: ConvertArgs, enabled: boolean) {
  return useQuery({
    queryKey: rateKeys.convert(args),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ from: args.from, to: args.to, amount: args.amount });
      if (args.on) params.set('on', args.on);
      return api.get<ConvertResponse>(`/rates/convert?${params.toString()}`, signal);
    },
    enabled,
    // Курс за время заполнения формы не меняется, а запрос уходит на каждую
    // введённую цифру — без этого кеша их было бы по одному на символ.
    staleTime: 5 * 60 * 1000,
    // Нет курса — не ошибка формы: поле просто остаётся без подсказки.
    retry: false,
  });
}
