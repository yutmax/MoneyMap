import type { CategoryResponse } from '@moneymap/shared';
import { seriesColor } from '@/shared/ui';
import { useCategories } from '../api/category-queries.ts';

/** Категория не найдена или не задана: нейтральный цвет, а не чужой оттенок. */
const NEUTRAL = 'var(--c-text-muted)';

/**
 * Цвет категории — один на всё приложение.
 *
 * Значок в ленте, полоса на главной и строка в отчёте должны быть одного
 * цвета: иначе «синее жильё» в отчёте оказывается «зелёным» в списке, и цвет
 * перестаёт что-либо значить. Поэтому он выводится из самой категории, а не
 * из её места в рейтинге трат: рейтинг меняется каждый месяц, категория — нет.
 *
 * Цвет, выбранный человеком, сильнее выведенного. Доходы — цветом дохода:
 * их мало, и отличать зарплату от подработки оттенком незачем. Расходам
 * шаг палитры назначается по порядку категории в каталоге; палитра короче
 * каталога, поэтому цвета повторяются — различает их значок и подпись.
 */
export function categoryColor(
  categoryId: string | null | undefined,
  categories: CategoryResponse[] | undefined,
): string {
  if (!categoryId || !categories) return NEUTRAL;

  const category = categories.find((item) => item.id === categoryId);
  if (!category) return NEUTRAL;
  if (category.color) return category.color;
  if (category.kind === 'income') return 'var(--c-income)';

  const index = categories
    .filter((item) => item.kind === 'expense')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .findIndex((item) => item.id === category.id);

  return seriesColor(Math.max(index, 0));
}

/** Тот же расчёт, привязанный к загруженному каталогу. */
export function useCategoryColor(): (categoryId: string | null | undefined) => string {
  const categories = useCategories();
  return (categoryId) => categoryColor(categoryId, categories.data);
}
