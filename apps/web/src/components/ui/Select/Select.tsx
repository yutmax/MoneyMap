import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx.ts';
import styles from './Select.module.scss';

interface SelectProps extends Omit<ComponentPropsWithRef<'select'>, 'className' | 'id'> {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}

/**
 * Нативный select, а не самописный дропдаун. На телефоне системный список
 * валют удобнее любого кастомного, а клавиатурная навигация и поиск по первым
 * буквам достаются бесплатно.
 */
export function Select({ label, error, children, ...rest }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        {...rest}
        id={id}
        className={cx(styles.control, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {children}
      </select>
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
