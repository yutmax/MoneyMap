import type { ReactNode } from 'react';
import { LocaleSwitch } from '@/features/locale-switch';
import { ThemeToggle } from '@/features/theme-switch';
import styles from './AuthCard.module.scss';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Карточка по центру экрана для страниц без шапки: вход, регистрация, письма.
 *
 * Лежит в widgets, а не в shared/ui, хотя сама ничего не знает про домен:
 * в углу у неё переключатели языка и темы, то есть она зависит от features,
 * а shared по правилам слоёв не может зависеть ни от чего выше себя.
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className={styles.root}>
      <div className={styles.corner}>
        <LocaleSwitch />
        <ThemeToggle />
      </div>

      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>

        {children}

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
