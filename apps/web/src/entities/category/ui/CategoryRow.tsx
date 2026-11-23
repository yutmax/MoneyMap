import type { CategoryResponse } from '@moneymap/shared';
import type { CSSProperties } from 'react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, isIconName, type IconName } from '@/shared/ui';
import { useCategoryColor } from '../lib/category-color.ts';
import { categoryName } from '../lib/category-name.ts';
import styles from './CategoryRow.module.scss';

interface CategoryRowProps {
  category: CategoryResponse;
  /** Вложенная категория рисуется со сдвигом. */
  nested?: boolean;
}

/**
 * Строка категории: цветная плитка со значком, название, число операций.
 *
 * Плитка здесь та же, что в ленте операций и в отчётах, — эта страница
 * заодно служит легендой: по ней видно, каким цветом и значком категория
 * отмечена во всём приложении.
 */
export function CategoryRow({ category, nested = false }: CategoryRowProps) {
  const { t } = useT();
  const color = useCategoryColor();

  // Имя иконки приходит из каталога, поэтому проверяется: в карте его может
  // уже не быть — тогда рисуется нейтральный значок, а не пустая плитка.
  const icon: IconName =
    category.icon && isIconName(category.icon) ? category.icon : 'circle-ellipsis';
  const tile = { '--tile': color(category.id) } as CSSProperties;

  return (
    <li className={cx(styles.root, nested && styles.nested)}>
      <span className={styles.icon} style={tile}>
        <Icon name={icon} className={styles.glyph} />
      </span>

      <span className={styles.name}>{categoryName(t, category.key)}</span>

      {category.transactionCount > 0 && (
        <span className={styles.count}>
          {t('categories.transactions', { count: category.transactionCount })}
        </span>
      )}
    </li>
  );
}
