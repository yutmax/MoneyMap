import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, type IconName } from '@/shared/ui';
import styles from './FilterPill.module.scss';

interface FilterPillProps {
  /** Название фильтра для скринридера: на экране его заменяет значение. */
  label: string;
  value: string;
  /** Пустое значение — «фильтр не задан». */
  onChange: (value: string) => void;
  icon?: IconName;
  children: ReactNode;
}

/**
 * Фильтр-таблетка: нативный select, одетый в пилюлю.
 *
 * Нативный — ради того же, ради чего и остальные селекты проекта: системный
 * список на телефоне удобнее любого самописного, а клавиатура и поиск по
 * первым буквам достаются даром. Таблетка показывает выбранное значение
 * вместо подписи: «Основная карта» говорит больше, чем «Счёт: …».
 *
 * Заданный фильтр подсвечен и сбрасывается крестиком рядом — не нужно
 * открывать список, чтобы найти в нём «все».
 */
export function FilterPill({ label, value, onChange, icon, children }: FilterPillProps) {
  const { t } = useT();
  const active = value !== '';

  return (
    <span className={cx(styles.root, active && styles.active)}>
      {icon && <Icon name={icon} className={styles.icon} />}
      <select
        aria-label={label}
        className={cx(styles.select, icon && styles.withIcon)}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
      {active && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange('')}
          aria-label={`${t('transactions.clearFilter')}: ${label}`}
          title={t('transactions.clearFilter')}
        >
          <Icon name="x" className={styles.clearIcon} />
        </button>
      )}
    </span>
  );
}
