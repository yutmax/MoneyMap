import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '@/shared/lib';
import styles from './Select.module.scss';

interface SelectProps extends Omit<ComponentPropsWithRef<'select'>, 'className' | 'id'> {
  label: string;
  /**
   * `pill` — компактная таблетка без подчёркивания, для выбора внутри
   * плитки (валюта в конвертере). Подпись у неё остаётся, но только для
   * скринридера: рядом и так видно, что выбирается.
   */
  variant?: 'line' | 'pill';
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}

/**
 * Нативный select, а не самописный дропдаун. На телефоне системный список
 * валют удобнее любого кастомного, а клавиатурная навигация и поиск по первым
 * буквам достаются бесплатно.
 */
export function Select({ label, error, hint, variant = 'line', children, ...rest }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={styles.root}>
      <label className={variant === 'pill' ? 'visually-hidden' : styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        {...rest}
        id={id}
        className={cx(styles.control, variant === 'pill' && styles.pill, error && styles.invalid)}
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
