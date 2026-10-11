import type { CategoryResponse } from '@moneymap/shared';

export interface CategoryNode {
  category: CategoryResponse;
  children: CategoryResponse[];
}

/**
 * Плоский список в дерево на два уровня.
 *
 * Сервер отдаёт плоский список с parentId, а не готовое дерево: сортировка
 * и группировка — дело показа, и перекладывать их на API значит чинить
 * каждую правку интерфейса миграцией формата ответа.
 */
export function buildTree(
  categories: CategoryResponse[],
  kind: 'income' | 'expense',
): CategoryNode[] {
  const ofKind = categories.filter((c) => c.kind === kind);
  const roots = ofKind.filter((c) => c.parentId === null);

  return roots.map((category) => ({
    category,
    children: ofKind.filter((c) => c.parentId === category.id),
  }));
}
