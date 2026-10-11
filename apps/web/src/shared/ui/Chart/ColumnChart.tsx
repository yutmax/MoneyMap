import { useId, useState } from 'react';
import styles from './ColumnChart.module.scss';

export interface ColumnPoint {
  key: string;
  /** Подпись под столбцом. */
  label: string;
  /** Значения рядов, в том же порядке, что и `series`. */
  values: number[];
  /** Что показать во всплывающей подсказке: уже отформатированные строки. */
  tooltip: string[];
}

export interface ColumnSeries {
  name: string;
  color: string;
}

interface ColumnChartProps {
  points: ColumnPoint[];
  series: ColumnSeries[];
  /** Подпись оси значений: сумма уже отформатирована вызывающим. */
  formatTick: (value: number) => string;
}

const HEIGHT = 180;
const TICKS = 4;

/** Округляет верх шкалы до «круглого» числа, чтобы подписи оси читались. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/**
 * Сгруппированные столбцы с осью и подсказкой при наведении.
 *
 * Одна шкала на оба ряда: доходы и расходы меряются в одних деньгах,
 * и вторая ось превратила бы их сравнение в игру с масштабом — самую
 * частую ошибку в графиках.
 *
 * Сетка и ось нарисованы тоньше и бледнее данных: их задача — помогать
 * читать столбцы, а не соперничать с ними.
 */
export function ColumnChart({ points, series, formatTick }: ColumnChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();

  const max = niceMax(Math.max(...points.flatMap((p) => p.values), 0));
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => (max / TICKS) * i);
  const activePoint = points.find((p) => p.key === active);

  return (
    <div className={styles.root}>
      <div className={styles.legend}>
        {series.map((item) => (
          <span key={item.name} className={styles.legendItem}>
            <span className={styles.swatch} style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
        ))}
      </div>

      <div className={styles.plot}>
        <div className={styles.axis} aria-hidden="true">
          {[...ticks].reverse().map((tick) => (
            <span key={tick} className={styles.tick}>
              {formatTick(tick)}
            </span>
          ))}
        </div>

        <div className={styles.columns} style={{ blockSize: `${HEIGHT}px` }}>
          {/* Линии сетки лежат под столбцами и не перехватывают наведение. */}
          <div className={styles.grid} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className={styles.gridLine} />
            ))}
          </div>

          {points.map((point) => (
            <div
              key={point.key}
              className={styles.group}
              // Цель наведения — вся колонка целиком, а не узкий столбик:
              // попасть мышью в полоску шириной в пару пикселей нельзя.
              onMouseEnter={() => setActive(point.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(point.key)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              aria-describedby={titleId}
            >
              <div className={styles.bars}>
                {point.values.map((value, index) => (
                  <span
                    key={series[index]?.name ?? index}
                    className={styles.bar}
                    style={{
                      blockSize: `${max === 0 ? 0 : (value / max) * 100}%`,
                      backgroundColor: series[index]?.color,
                    }}
                  />
                ))}
              </div>
              <span className={styles.label}>{point.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.tooltip} id={titleId} role="status">
        {activePoint ? `${activePoint.label}: ${activePoint.tooltip.join(' · ')}` : ' '}
      </p>
    </div>
  );
}
