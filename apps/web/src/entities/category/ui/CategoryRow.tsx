import type { CategoryResponse } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './CategoryRow.module.scss';

interface CategoryRowProps {
  category: CategoryResponse;
  /** Вложенная категория рисуется со сдвигом. */
  nested?: boolean;
  actions?: ReactNode;
}

export function CategoryRow({ category, nested = false, actions }: CategoryRowProps) {
  const { t } = useT();

  return (
    <li className={cx(styles.root, nested && styles.nested)}>
      <span className={styles.name}>
        {category.color && (
          <span className={styles.dot} style={{ backgroundColor: category.color }} />
        )}
        {category.name}
      </span>

      {category.transactionCount > 0 && (
        <span className={styles.count}>
          {t('categories.transactions', { count: category.transactionCount })}
        </span>
      )}

      {actions && <span className={styles.actions}>{actions}</span>}
    </li>
  );
}
