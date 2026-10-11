import { toDecimal, type NetWorthPoint } from '@moneymap/shared';
import styles from './Sparkline.module.scss';

interface SparklineProps {
  points: NetWorthPoint[];
  /** Что прочитает скринридер вместо картинки. */
  label: string;
}

const WIDTH = 100;
const HEIGHT = 28;

/**
 * График net worth по снимкам (§8.6).
 *
 * Своя полилиния, а не библиотека графиков: здесь нет ни осей, ни подсказок,
 * ни зума — только форма линии, и ради неё тащить charting-пакет не нужно.
 * Настоящие графики с осями и легендой появятся в отчётах (фаза 5), и выбор
 * библиотеки — разговор того момента, а не этого.
 *
 * viewBox в условных единицах с preserveAspectRatio="none": линия тянется
 * по ширине контейнера, какой бы он ни был, без пересчёта координат.
 */
export function Sparkline({ points, label }: SparklineProps) {
  if (points.length < 2) return null;

  const values = points.map((point) => toDecimal(point.total).toNumber());
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Плоская история — это ровная линия по середине, а не деление на ноль.
  const span = max - min || 1;

  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH;
      // SVG считает y сверху вниз, поэтому большее значение — меньший y.
      const y = HEIGHT - ((value - min) / span) * HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const last = values.at(-1) ?? 0;
  const first = values[0] ?? 0;

  return (
    <svg
      className={styles.root}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path
        className={last >= first ? styles.up : styles.down}
        d={path}
        fill="none"
        // Толщина и скругления в единицах viewBox растянулись бы вместе
        // с ним; vector-effect оставляет линию той же, какой задана.
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
