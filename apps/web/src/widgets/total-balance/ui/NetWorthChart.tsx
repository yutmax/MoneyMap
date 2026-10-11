import { formatMoney, toDecimal, type NetWorthPoint } from '@moneymap/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useT } from '@/shared/i18n';
import { formatDate } from '@/shared/lib';
import styles from './NetWorthChart.module.scss';

interface NetWorthChartProps {
  points: NetWorthPoint[];
  currency: string;
  decimals: number;
  symbol?: string | undefined;
}

/**
 * График общего баланса за месяц.
 *
 * Здесь взята библиотека, хотя остальные графики в проекте нарисованы
 * руками: у этого есть ось времени, подсказка под курсором и попадание
 * в ближайшую точку — то есть ровно та часть графика, которая стоит дорого
 * и которую библиотеки и продают. Загружается он отдельным кусочком
 * (React.lazy на стороне вызова), чтобы вес recharts не задерживал первый
 * экран.
 *
 * Цвета берутся из CSS-переменных: recharts отдаёт их в атрибуты SVG как
 * есть, поэтому переключение темы остаётся делом каскада, а не React.
 */
export function NetWorthChart({ points, currency, decimals, symbol }: NetWorthChartProps) {
  const { t, locale } = useT();

  const data = points.map((point) => ({
    date: point.date,
    value: toDecimal(point.total).toNumber(),
  }));

  const first = data[0]?.value ?? 0;
  const last = data.at(-1)?.value ?? 0;
  const rising = last >= first;
  const line = rising ? 'var(--c-income)' : 'var(--c-expense)';

  const money = (value: number) =>
    formatMoney(String(value), { currency, decimals, locale, ...(symbol ? { symbol } : {}) });

  /**
   * Подписи оси.
   *
   * Разрядность выводится из размаха, а не задана наперёд: баланс колеблется
   * в узкой полосе, и сокращённая запись превращала все деления в одно и то
   * же «8 тыс.». Сокращение остаётся только для миллионов, где длинное число
   * уже не помещается.
   */
  const span = Math.max(...data.map((p) => p.value)) - Math.min(...data.map((p) => p.value));
  const fraction = span >= 100 ? 0 : span >= 5 ? 1 : span >= 1 ? 2 : 6;
  const tick = (value: number) =>
    new Intl.NumberFormat(locale, {
      ...(Math.abs(value) >= 1_000_000 ? { notation: 'compact' as const } : {}),
      maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : fraction,
    }).format(value);

  const day = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    );

  return (
    <div className={styles.root}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {/* Заливка под линией — тот же цвет, уведённый в прозрачность:
                она подсказывает направление, но не спорит с самой линией. */}
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line} stopOpacity={0.28} />
              <stop offset="100%" stopColor={line} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={day}
            tick={{ fill: 'var(--c-text-faint)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={tick}
            tick={{ fill: 'var(--c-text-faint)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            // Шкала не обязана начинаться с нуля: баланс колеблется в узкой
            // полосе, и растянутая до нуля ось превращает её в прямую.
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }}
            // Своя разметка вместо стандартной: деньги здесь строки
            // с фиксированной разрядностью валюты, а не числа общего вида.
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { date: string; value: number } | undefined;
              if (!active || !point) return null;
              return (
                <div className={styles.tooltip}>
                  <span className={styles.tooltipDate}>{formatDate(point.date, locale)}</span>
                  <span className={styles.tooltipValue}>{money(point.value)}</span>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={line}
            strokeWidth={2}
            fill="url(#netWorthFill)"
            // Точка появляется только под курсором: тридцать точек на линии
            // превращают её в пунктир из кружков.
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: line }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className={styles.caption}>
        {t('summary.change', {
          amount: money(last - first),
          days: data.length,
        })}
      </p>
    </div>
  );
}
