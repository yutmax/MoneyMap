import { useState } from 'react';
import { cx } from '@/shared/lib';
import styles from './DonutChart.module.scss';

export interface DonutSegment {
  key: string;
  label: string;
  /** Доля от целого, 0..1. */
  share: number;
  /** Отформатированная сумма для легенды. */
  value: string;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Крупное число в центре кольца: то, из чего состоят доли. */
  total: string;
  /** Подпись под ним, пока ни один сектор не выбран. */
  caption: string;
}

/** Радиус в единицах viewBox. Толщина кольца подобрана под него, не наоборот. */
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Зазор между секторами — фон, просвечивающий между заливками. Без него две
 * соседние дуги сливаются в одну, и граница доли теряется ровно там, где её
 * и надо увидеть.
 */
const GAP = 3;

/** Минимальная дуга: доля в полпроцента иначе не рисуется вовсе. */
const MIN_ARC = 2;

/**
 * Доли целого кольцом.
 *
 * Кольцо, а не полосы: прочитать «из чего состоит месяц» одним взглядом оно
 * позволяет лучше, и именно этого от раздела ждут. Платить за это приходится
 * точностью — доли площади глаз сравнивает заметно хуже долей длины, — поэтому
 * числа никуда не делись: сумма и процент у каждой строки легенды, а процент
 * выбранного сектора встаёт в центр кольца.
 *
 * Больше шести секторов не бывает по построению: дальше соседние цвета
 * перестают различаться, и хвост сворачивается в «прочее» на стороне
 * вызывающего — там, где известно, что складывать.
 *
 * Нарисовано вручную, как и остальные графики проекта: кольцо — это окружность
 * с пунктиром из одного штриха, и библиотека здесь не добавила бы ничего,
 * кроме веса.
 */
export function DonutChart({ segments, total, caption }: DonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = segments.find((segment) => segment.key === hovered);

  // Смещение копится по исходным долям, а не по укороченным на зазор дугам:
  // иначе сектора поехали бы по кругу, накапливая сдвиг от первого к последнему.
  let offset = 0;
  const arcs = segments.map((segment) => {
    const full = segment.share * CIRCUMFERENCE;
    const arc = { segment, length: Math.max(full - GAP, MIN_ARC), offset };
    offset += full;
    return arc;
  });

  return (
    <div className={styles.root}>
      <div className={styles.figure}>
        <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true" focusable="false">
          <circle className={styles.track} cx="50" cy="50" r={RADIUS} />
          {arcs.map(({ segment, length, offset: start }) => (
            <circle
              key={segment.key}
              cx="50"
              cy="50"
              r={RADIUS}
              className={cx(
                styles.arc,
                hovered !== null && hovered !== segment.key && styles.dimmed,
              )}
              stroke={segment.color}
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-start}
              onMouseEnter={() => setHovered(segment.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {/*
          Центр — обычная разметка поверх svg, а не foreignObject: текст должен
          наследовать шрифт и переноситься по-человечески.
        */}
        <div className={styles.center}>
          <span className={styles.total}>
            {active ? `${Math.round(active.share * 100)} %` : total}
          </span>
          <span className={styles.caption}>{active ? active.label : caption}</span>
        </div>
      </div>

      {/* Легенда обязательна: цвет сам по себе никого не называет, а суммы
          здесь — единственное точное, что есть на диаграмме. */}
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li
            key={segment.key}
            className={cx(
              styles.item,
              hovered !== null && hovered !== segment.key && styles.dimmed,
            )}
            onMouseEnter={() => setHovered(segment.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={styles.dot} style={{ backgroundColor: segment.color }} />
            <span className={styles.label}>{segment.label}</span>
            <span className={styles.share}>{Math.round(segment.share * 100)}%</span>
            <span className={styles.value}>{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
