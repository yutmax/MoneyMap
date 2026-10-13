import type { CategoryResponse } from '@moneymap/shared';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, isIconName } from '@/shared/ui';
import { categoryName } from '../lib/category-name.ts';
import styles from './CategoryRow.module.scss';

interface CategoryRowProps {
  category: CategoryResponse;
  /** Вложенная категория рисуется со сдвигом. */
  nested?: boolean;
}

export function CategoryRow({ category, nested = false }: CategoryRowProps) {
  const { t } = useT();

  return (
    <li className={cx(styles.root, nested && styles.nested)}>
      <span className={styles.name}>
        {/* Имя иконки приходит из каталога, поэтому проверяется: в карте его
            может уже не быть, и рисовать тогда нечего — подпись остаётся. */}
        {category.icon && isIconName(category.icon) && (
          <Icon name={category.icon} className={styles.icon} />
        )}
        {category.color && (
          <span className={styles.dot} style={{ backgroundColor: category.color }} />
        )}
        {categoryName(t, category.key)}
      </span>

      {category.transactionCount > 0 && (
        <span className={styles.count}>
          {t('categories.transactions', { count: category.transactionCount })}
        </span>
      )}
    </li>
  );
}
