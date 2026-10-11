import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '@/shared/lib';
import styles from './Select.module.scss';

interface SelectProps extends Omit<ComponentPropsWithRef<'select'>, 'className' | 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}

/**
 * Нативный select, а не самописный дропдаун. На телефоне системный список
 * валют удобнее любого кастомного, а клавиатурная навигация и поиск по первым
 * буквам достаются бесплатно.
 */
export function Select({ label, error, hint, children, ...rest }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

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
        aria-describedby={cx(error && errorId, hint && hintId) || undefined}
      >
        {children}
      </select>
      {hint && !error && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
