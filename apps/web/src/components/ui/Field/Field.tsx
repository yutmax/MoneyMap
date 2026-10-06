import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx.ts';
import styles from './Field.module.scss';

// ComponentPropsWithRef, а не InputHTMLAttributes: react-hook-form передаёт
// ref через register(), и в React 19 ref — обычный проп функционального компонента.
interface FieldProps extends Omit<ComponentPropsWithRef<'input'>, 'className' | 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Содержимое справа от подписи: например, ссылка «Забыли пароль?». */
  labelAside?: ReactNode;
}

export function Field({ label, error, hint, labelAside, ...inputProps }: FieldProps) {
  // useId, а не руками: один и тот же компонент может быть на странице дважды,
  // а дубль id ломает связь label с полем.
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={styles.root}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {labelAside}
      </div>

      <input
        {...inputProps}
        id={id}
        className={cx(styles.control, error && styles.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(error && errorId, hint && hintId) || undefined}
      />

      {hint && !error && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        // role="alert" — чтобы скринридер прочитал ошибку сразу после отправки,
        // а не только когда пользователь вернётся к полю.
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
