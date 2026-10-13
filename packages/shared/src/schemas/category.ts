import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { uuidSchema } from './common.ts';

export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const categoryKindSchema = z.enum(CATEGORY_KINDS, {
  message: msg('validation.category.kind'),
});

export const categoryIdParamSchema = z.object({ id: uuidSchema });

/**
 * Категория только читается (§8.4).
 *
 * Схем создания, правки и удаления здесь нет, и это не упущение: набор задан
 * разработчиком, менять его из приложения нельзя. Вернутся они вместе с
 * пользовательскими категориями.
 */
export interface CategoryResponse {
  id: string;
  /**
   * Ключ категории в каталоге: `groceries`, `salary`.
   *
   * Наружу идёт ключ, а не готовая подпись — по тому же правилу, что и
   * сообщения об ошибках (§10.5). Текст появляется на клиенте,
   * `categoryName()` переводит его на язык интерфейса, и смена языка
   * переименовывает категории без похода на сервер.
   */
  key: string;
  kind: CategoryKind;
  parentId: string | null;
  /** Имя иконки из карты ICONS. Задаётся каталогом, человеком не меняется. */
  icon: string | null;
  color: string | null;
  sortOrder: number;
  /** Сколько операций ссылается на категорию. */
  transactionCount: number;
  createdAt: string;
}
