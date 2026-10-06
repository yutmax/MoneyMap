import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle.tsx';
import styles from './AuthLayout.module.scss';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.root}>
      <div className={styles.corner}>
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
