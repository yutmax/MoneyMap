import { cx } from '@/shared/lib';
import styles from './Logo.module.scss';

interface LogoProps {
  /** Только знак, без названия: для мест, где название уже написано рядом. */
  markOnly?: boolean;
  className?: string;
}

/**
 * Марка MoneyMap: лаймовая плашка с монограммой M и название.
 *
 * Буква нарисована одной линией — вниз и снова вверх, как график, — и это та
 * же фигура, что на иконке приложения (scripts/icons.mjs), только в поле
 * 32 вместо 512. Так знак на домашнем экране телефона и в боковой панели
 * один и тот же, а не два разных рисунка одного бренда.
 *
 * Знак скрыт от скринридера: название рядом с ним — текст, и его прочитают.
 */
export function Logo({ markOnly = false, className }: LogoProps) {
  return (
    <span className={cx(styles.root, className)}>
      <svg viewBox="0 0 32 32" className={styles.mark} aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="9" className={styles.plate} />
        <path
          d="M8 23V10l8 8 8-8v13"
          className={styles.letter}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {markOnly ? (
        <span className="visually-hidden">MoneyMap</span>
      ) : (
        <span className={styles.word}>MoneyMap</span>
      )}
    </span>
  );
}
