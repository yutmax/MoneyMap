import styles from './StackedBar.module.scss';

export interface StackedSegment {
  key: string;
  label: string;
  /** Доля от целого, 0..1. */
  share: number;
  /** Отформатированная сумма для легенды. */
  value: string;
  color: string;
}

interface StackedBarProps {
  segments: StackedSegment[];
}

/**
 * Одна полоса, разложенная на доли, с легендой под ней.
 *
 * Вместо круговой диаграммы: доли длины сравниваются глазом точно,
 * доли площади — нет, а подписи у секторов либо наезжают друг на друга,
 * либо уезжают на выноски.
 *
 * Между сегментами оставлен зазор цветом фона: без него две соседние
 * заливки сливаются в одну, и граница доли теряется ровно там, где её
 * и надо увидеть. Легенда есть всегда — цвет не единственный признак.
 */
export function StackedBar({ segments }: StackedBarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={styles.segment}
            style={{ inlineSize: `${segment.share * 100}%`, backgroundColor: segment.color }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.key} className={styles.item}>
            <span className={styles.swatch} style={{ backgroundColor: segment.color }} />
            <span className={styles.label}>{segment.label}</span>
            <span className={styles.value}>{segment.value}</span>
            <span className={styles.share}>{Math.round(segment.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
