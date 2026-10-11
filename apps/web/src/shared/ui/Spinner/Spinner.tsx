import { cx } from '@/shared/lib';
import styles from './Spinner.module.scss';

interface SpinnerProps {
  /** Занять высоту экрана — для ожидания на уровне маршрута. */
  fullscreen?: boolean;
  label?: string;
}

export function Spinner({ fullscreen = false, label = 'Загрузка' }: SpinnerProps) {
  return (
    // role="status" + aria-live: скринридер сообщит о загрузке, не выдёргивая
    // фокус из текущего места.
    <div
      className={cx(styles.root, fullscreen && styles.fullscreen)}
      role="status"
      aria-live="polite"
    >
      <span className={styles.spinner} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
