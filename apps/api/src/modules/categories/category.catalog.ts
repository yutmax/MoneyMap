import { translate, type Locale } from '@moneymap/shared';

/**
 * Каталог категорий (§8.4).
 *
 * Единственный источник правды о том, какие категории существуют, как они
 * называются и чем рисуются. В базе от категории остаётся только `default_key`
 * и то, по чему идут запросы: вид, порядок, владелец.
 *
 * Так сделано потому, что категории больше не пользовательские данные.
 * Завести свою, переименовать или удалить нельзя — набор задан разработчиком.
 * Хранить при этом подпись в каждой строке значило бы держать копию того, что
 * и так лежит в словаре, и разъезжаться с ним при любой правке текста.
 *
 * Побочное следствие — верное: смена языка интерфейса теперь переименовывает
 * категории. Раньше §8.4 требовал обратного, и правильно требовал: названия
 * были записями человека. Теперь это наши подписи, и показывать их на чужом
 * языке не на чем.
 */

export interface DefaultCategory {
  key: string;
  kind: 'income' | 'expense';
  /** Имя из карты ICONS на фронтенде, не имя компонента lucide. */
  icon: string;
}

/**
 * Набор широкий намеренно: добавить своё нельзя, поэтому то, чего здесь нет,
 * человеку взять негде. Лучше лишняя строка, чем расход, которому некуда встать.
 *
 * Порядок строк задаёт `sortOrder` и, значит, порядок на экране. Ключи менять
 * нельзя: по ним категории связаны с историей операций.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { key: 'salary', kind: 'income', icon: 'banknote' },
  { key: 'sideIncome', kind: 'income', icon: 'briefcase' },
  { key: 'interest', kind: 'income', icon: 'trending-up' },
  { key: 'refunds', kind: 'income', icon: 'rotate-ccw' },
  { key: 'giftsIn', kind: 'income', icon: 'gift' },
  { key: 'otherIncome', kind: 'income', icon: 'circle-ellipsis' },

  { key: 'groceries', kind: 'expense', icon: 'shopping-cart' },
  { key: 'eatingOut', kind: 'expense', icon: 'utensils' },
  { key: 'transport', kind: 'expense', icon: 'bus' },
  { key: 'car', kind: 'expense', icon: 'car' },
  { key: 'housing', kind: 'expense', icon: 'housing' },
  { key: 'utilities', kind: 'expense', icon: 'plug' },
  { key: 'connectivity', kind: 'expense', icon: 'wifi' },
  { key: 'health', kind: 'expense', icon: 'heart-pulse' },
  { key: 'beauty', kind: 'expense', icon: 'sparkles' },
  { key: 'clothes', kind: 'expense', icon: 'shirt' },
  { key: 'entertainment', kind: 'expense', icon: 'clapperboard' },
  { key: 'sport', kind: 'expense', icon: 'dumbbell' },
  { key: 'education', kind: 'expense', icon: 'graduation-cap' },
  { key: 'travel', kind: 'expense', icon: 'plane' },
  { key: 'pets', kind: 'expense', icon: 'paw-print' },
  { key: 'subscriptions', kind: 'expense', icon: 'repeat' },
  { key: 'giftsOut', kind: 'expense', icon: 'party-popper' },
  { key: 'taxes', kind: 'expense', icon: 'landmark' },
  { key: 'otherExpense', kind: 'expense', icon: 'circle-ellipsis' },
];

const BY_KEY = new Map(DEFAULT_CATEGORIES.map((item) => [item.key, item]));

/**
 * Позиция в наборе. Кратна десяти, чтобы вставить категорию между соседними
 * можно было, не переписывая порядок у остальных.
 */
export function defaultSortOrder(key: string): number {
  const index = DEFAULT_CATEGORIES.findIndex((item) => item.key === key);
  return (index + 1) * 10;
}

/**
 * Подпись категории на языке запроса.
 *
 * Ключа нет в словаре — наружу уходит сам ключ: так забытый перевод видно,
 * а не подменено пустотой.
 */
export function categoryName(locale: Locale, key: string): string {
  return translate(locale, `defaults.categories.${key}`);
}

/** То же для `category_id is null` — у перевода категории нет. */
export function categoryNameOrNull(locale: Locale, key: string | null): string | null {
  return key === null ? null : categoryName(locale, key);
}

export function categoryIcon(key: string | null): string | null {
  return key === null ? null : (BY_KEY.get(key)?.icon ?? null);
}
