import type { ReactNode } from 'react';
import { cx } from '@/shared/lib';
import styles from './Alert.module.scss';

interface AlertProps {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
  /** Детали ошибок по полям, если их некуда разложить. */
  details?: Array<{ path: string; message: string }>;
}

/**
 * Закрывает дыру из прототипа: класс .error-message использовался в разметке
 * формы входа, но не существовал ни в одном scss-файле — ошибки показывались
 * дефолтным текстом без признака того, что это ошибка.
 */
export function Alert({ tone = 'error', children, details }: AlertProps) {
  return (
    <div className={cx(styles.root, styles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <div>
        {children}
        {details && details.length > 0 && (
          <ul className={styles.list}>
            {details.map((d) => (
              <li key={`${d.path}-${d.message}`}>{d.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
