import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib';
import styles from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: 'medium' | 'small';
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  block = false,
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      // aria-busy, а не подмена текста на «Загрузка…»: скринридер сообщит
      // о состоянии, но не потеряет подпись кнопки.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx(
        styles.root,
        styles[variant],
        size === 'small' && styles.small,
        block && styles.block,
      )}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
