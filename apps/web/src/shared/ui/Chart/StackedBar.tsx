import { cx } from '@/shared/lib';
import styles from './StackedBar.module.scss';

export interface StackedSegment {
  key: string;
  label: string;
  /** Доля от целого, 0..1. */
  share: number;
  /** Отформатированная сумма для легенды. */
  value: string;
  color: string;
  /** Отрицательная величина: долг — тоже доля, но другого знака. */
  negative?: boolean;
}

interface StackedBarProps {
  segments: StackedSegment[];
}

/**
 * Доли одной величины: цветные сегменты в строку и легенда под ними.
 *
 * Вместо круговой диаграммы: доли длины глаз сравнивает точно, доли
 * площади — нет, а подписи у секторов либо наезжают друг на друга, либо
 * уезжают на выноски.
 *
 * Сегменты скруглены и разделены зазором цветом фона, а не состыкованы
 * вплотную: две соседние заливки иначе сливаются в одну, и граница доли
 * теряется ровно там, где её и надо увидеть. Зазор постоянный, поэтому
 * сумма ширин чуть меньше ста процентов — на счёт это не влияет, проценты
 * в легенде считаются из самих долей.
 */
export function StackedBar({ segments }: StackedBarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={cx(styles.segment, segment.negative && styles.negative)}
            style={{
              // Минимум, чтобы доля в полпроцента осталась видимой:
              // сегмент тоньше скругления превращается в точку.
              flexBasis: `${Math.max(segment.share * 100, 2)}%`,
              backgroundColor: segment.color,
            }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.key} className={styles.item}>
            <span className={styles.dot} style={{ backgroundColor: segment.color }} />
            <span className={styles.label}>{segment.label}</span>
            <span className={styles.share}>({Math.round(segment.share * 100)}%)</span>
            <span className={styles.value}>{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
