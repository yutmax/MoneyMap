import { cx } from '@/shared/lib';
import styles from './BarList.module.scss';

export interface BarListItem {
  key: string;
  label: string;
  /** Уже отформатированная сумма: форматирование денег — не дело графика. */
  value: string;
  /** Доля от наибольшего значения, 0..1. Она и задаёт длину полосы. */
  ratio: number;
  /** Подпись справа от суммы, обычно процент от целого. */
  hint?: string;
}

interface BarListProps {
  items: BarListItem[];
  /** Цвет полос. По умолчанию акцент: один ряд — одна величина. */
  color?: string;
}

/**
 * Горизонтальные полосы со значениями.
 *
 * Для сравнения величин — именно полосы, а не круговая диаграмма: длину
 * глаз сравнивает точно, площадь сектора — нет. Длинные названия категорий
 * тоже требуют горизонтали, иначе подписи встают по диагонали.
 *
 * Один ряд — один цвет: здесь кодируется величина, а не принадлежность,
 * и разноцветные полосы сообщали бы различие, которого нет. Значение
 * подписано у каждой полосы, поэтому цвет вообще ничего не несёт
 * и читается при любом зрении.
 */
export function BarList({ items, color }: BarListProps) {
  return (
    <ul className={styles.root}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          <span className={styles.label} title={item.label}>
            {item.label}
          </span>
          <span className={styles.value}>{item.value}</span>
          {item.hint && <span className={styles.hint}>{item.hint}</span>}
          <span className={styles.track}>
            <span
              className={cx(styles.bar)}
              style={{
                inlineSize: `${Math.max(item.ratio * 100, 1.5)}%`,
                ...(color ? { backgroundColor: color } : {}),
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
