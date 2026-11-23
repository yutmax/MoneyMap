import {
  daysBetween,
  formatMoney,
  isNegative,
  isZero,
  shiftDays,
  subtract,
  toDecimal,
  todayIn,
} from '@moneymap/shared';
import { useMemo, useState, type CSSProperties } from 'react';
import { categoryColor, categoryNameOrNull, useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { csvUrl, useCashflowReport, useCategoryReport, useReportSummary } from '@/entities/report';
import { useMe } from '@/entities/user';
import { BudgetBlock } from '@/features/budgets';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import {
  Alert,
  ColumnChart,
  Icon,
  isIconName,
  restColor,
  seriesColor,
  Spinner,
  StackedBar,
  type IconName,
} from '@/shared/ui';
import styles from './ReportsPage.module.scss';

/** Готовые периоды: своя пара дат нужна редко, а выбирать её долго. */
const RANGES = ['month', 'quarter', 'year'] as const;
type Range = (typeof RANGES)[number];

function periodOf(range: Range, today: string): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number) as [number, number, number];
  const iso = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

  if (range === 'month') return { from: iso(year, month, 1), to: today };
  if (range === 'quarter') return { from: iso(year, month - 2, 1), to: today };
  return { from: iso(year, 1, 1), to: today };
}

/**
 * Период той же длины прямо перед выбранным — с ним сравниваются итоги.
 *
 * Той же длины, а не «прошлый месяц целиком»: двадцать три дня ноября
 * против тридцати одного дня октября всегда выглядели бы экономией.
 */
function previousOf(period: { from: string; to: string }): { from: string; to: string } {
  const length = daysBetween(period.from, period.to) + 1;
  return { from: shiftDays(period.from, -length), to: shiftDays(period.from, -1) };
}

/** Изменение в процентах; null — сравнивать не с чем. */
function percentChange(current: string, previous: string | undefined): number | null {
  if (previous === undefined || isZero(previous)) return null;
  return Math.round(
    toDecimal(current)
      .minus(toDecimal(previous))
      .div(toDecimal(previous).abs())
      .times(100)
      .toNumber(),
  );
}

/**
 * Отчёты: итоги периода, движение по месяцам, бюджеты и на что ушли деньги.
 *
 * Категории показаны рейтингом полос, а не кольцом: длину глаз сравнивает
 * точно, площадь сектора — нет, и одиннадцать категорий в кольце сливались
 * в рябь. Цвет у категории тот же, что у её значка в ленте операций.
 */
export function ReportsPage() {
  const { t, locale } = useT();
  const { user } = useMe();
  const currencies = useCurrencies();
  const catalog = useCategories();
  const [range, setRange] = useState<Range>('month');

  const today = todayIn(user?.timezone ?? 'UTC');
  const period = useMemo(() => periodOf(range, today), [range, today]);
  const previousPeriod = useMemo(() => previousOf(period), [period]);

  // График по месяцам показывает полгода вне зависимости от выбранного
  // периода: один столбец «этот месяц» ничего не сравнивает.
  const cashflowPeriod = useMemo(() => {
    if (range === 'year') return period;
    const [year, month] = today.split('-').map(Number) as [number, number];
    const start = new Date(Date.UTC(year, month - 1 - 5, 1)).toISOString().slice(0, 10);
    return { from: start, to: today };
  }, [range, period, today]);

  const summary = useReportSummary(period);
  const previous = useReportSummary(previousPeriod);
  const expenses = useCategoryReport(period, 'expense');
  const cashflow = useCashflowReport(cashflowPeriod);

  const data = summary.data;
  const base = data?.baseCurrency ?? user?.baseCurrency ?? '';
  const currency = currencies.data?.find((c) => c.code === base);

  const money = (amount: string, signed = false) =>
    formatMoney(amount, {
      currency: base,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(signed && !isZero(amount) ? { signDisplay: 'always' as const } : {}),
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });

  const tick = (value: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  const percent = (value: number | null) =>
    value === null
      ? null
      : t('reports.versusPrevious', { change: `${value > 0 ? '+' : ''}${value}%` });

  const income = data?.income ?? '0';
  const expense = data?.expense ?? '0';
  const net = data?.net ?? '0';
  const saved =
    !isZero(income) && !isNegative(net)
      ? Math.round(toDecimal(net).div(toDecimal(income)).times(100).toNumber())
      : null;
  const netChange = previous.data ? subtract(net, previous.data.net) : null;

  const categories = expenses.data?.categories ?? [];
  const maxShare = Math.max(...categories.map((row) => row.share), 0);

  const months = (cashflow.data?.points ?? []).map((point) => ({
    key: point.month,
    label: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${point.month}T00:00:00Z`),
    ),
    values: [toDecimal(point.income).toNumber(), toDecimal(point.expense).toNumber()],
    tooltip: [
      `${t('reports.income')} ${money(point.income)}`,
      `${t('reports.expense')} ${money(point.expense)}`,
      `${t('reports.net')} ${money(point.net)}`,
    ],
  }));

  // У крупнейших операций сервер отдаёт ключ категории, а не её id: значок
  // и цвет находятся по ключу в каталоге.
  const categoryByKey = (key: string | null) =>
    key === null ? undefined : catalog.data?.find((item) => item.key === key);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <p className={styles.subtitle}>
          {t('reports.period', {
            from: formatDate(period.from, locale),
            to: formatDate(period.to, locale),
          })}
          {data ? ` · ${t('reports.countInline', { count: data.count })}` : ''}
        </p>

        <div className={styles.controls}>
          {/* Период — переключателем: вариантов три, и все они видны сразу. */}
          <div className={styles.ranges} role="group" aria-label={t('reports.range')}>
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                className={cx(styles.range, range === value && styles.rangeActive)}
                onClick={() => setRange(value)}
                aria-pressed={range === value}
              >
                {t(`reports.ranges.${value}`)}
              </button>
            ))}
          </div>

          {/* Обычная ссылка с download: файл отдаёт сервер, имя приходит
              заголовком Content-Disposition, и браузер умеет это сам. */}
          <a className={styles.export} href={csvUrl(period)} download>
            {t('reports.export')}
          </a>
        </div>
      </header>

      {summary.isError && <Alert>{t('reports.loadFailed')}</Alert>}

      {summary.isPending && !data ? (
        <Spinner />
      ) : (
        <>
          <section className={styles.totals}>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.income')}</p>
              <p className={cx(styles.tileValue, styles.income)}>{money(income, true)}</p>
              <p className={styles.tileNote}>
                {percent(percentChange(income, previous.data?.income)) ?? ' '}
              </p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.expense')}</p>
              <p className={styles.tileValue}>{money(isZero(expense) ? '0' : `-${expense}`)}</p>
              <p className={styles.tileNote}>
                {percent(percentChange(expense, previous.data?.expense)) ?? ' '}
              </p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.net')}</p>
              <p className={cx(styles.tileValue, isNegative(net) && styles.negative)}>
                {money(net)}
              </p>
              <p className={styles.tileNote}>
                {netChange === null
                  ? ' '
                  : t('reports.versusPrevious', { change: money(netChange, true) })}
              </p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.saved')}</p>
              <p className={styles.tileValue}>{saved === null ? '—' : `${saved}%`}</p>
              {/* Единственная лаймовая полоса на странице: доля дохода,
                  которая осталась, — то число, ради которого ведут учёт. */}
              <div className={styles.meter} aria-hidden="true">
                <span className={styles.meterFill} style={{ inlineSize: `${saved ?? 0}%` }} />
              </div>
            </article>
          </section>

          <div className={styles.split}>
            {months.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>{t('reports.cashflowTitle')}</h2>
                <ColumnChart
                  points={months}
                  series={[
                    { name: t('reports.income'), color: 'var(--c-income)' },
                    // Расход — нейтральным: красный остаётся за превышением
                    // бюджета, обычная трата тревогой не является.
                    { name: t('reports.expense'), color: restColor },
                  ]}
                  formatTick={tick}
                />
              </section>
            )}

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('budgets.title')}</h2>
              <BudgetBlock />
            </section>
          </div>

          <div className={styles.columns}>
            <section className={styles.block}>
              <header className={styles.blockHeader}>
                <h2 className={styles.blockTitle}>{t('reports.byCategoryTitle')}</h2>
                <span className={styles.blockMeta}>{money(expense)}</span>
              </header>

              {categories.length === 0 ? (
                <p className={styles.empty}>{t('reports.noData')}</p>
              ) : (
                <ul className={styles.rank}>
                  {categories.map((row) => {
                    const color = categoryColor(row.categoryId, catalog.data);
                    return (
                      <li key={row.categoryId ?? 'none'} className={styles.rankRow}>
                        <span className={styles.rankName}>
                          <span className={styles.dot} style={{ backgroundColor: color }} />
                          <span className={styles.rankLabel}>
                            {categoryNameOrNull(t, row.categoryKey) ??
                              t('transactions.categoryNone')}
                          </span>
                        </span>
                        <span className={styles.rankTrack} aria-hidden="true">
                          <span
                            className={styles.rankFill}
                            style={{
                              // Ширина — от самой крупной категории, а не от
                              // всех трат: иначе у первой строки полоса на
                              // треть, и сравнивать остальные не с чем.
                              inlineSize: `${maxShare > 0 ? (row.share / maxShare) * 100 : 0}%`,
                              backgroundColor: color,
                            }}
                          />
                        </span>
                        <span className={styles.rankShare}>{Math.round(row.share * 100)}%</span>
                        <span className={styles.rankAmount}>{money(row.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className={styles.side}>
              {(data?.largest.length ?? 0) > 0 && (
                <section className={styles.block}>
                  <h2 className={styles.blockTitle}>{t('reports.largestTitle')}</h2>
                  <ul className={styles.largest}>
                    {data?.largest.map((row) => {
                      const category = categoryByKey(row.categoryKey);
                      const icon: IconName =
                        category?.icon && isIconName(category.icon)
                          ? category.icon
                          : 'circle-ellipsis';
                      const tile = {
                        '--tile': categoryColor(category?.id, catalog.data),
                      } as CSSProperties;

                      return (
                        <li key={row.id} className={styles.largestRow}>
                          <span className={styles.largestIcon} style={tile}>
                            <Icon name={icon} className={styles.largestGlyph} />
                          </span>
                          <span className={styles.largestInfo}>
                            <span className={styles.largestName}>
                              {categoryNameOrNull(t, row.categoryKey) ??
                                t('transactions.categoryNone')}
                            </span>
                            <span className={styles.largestMeta}>
                              <time dateTime={row.occurredOn}>
                                {formatDate(row.occurredOn, locale)}
                              </time>
                              {' · '}
                              {row.accountName}
                            </span>
                          </span>
                          <span
                            className={cx(
                              styles.largestAmount,
                              row.kind === 'income' && styles.income,
                            )}
                          >
                            {money(row.kind === 'expense' ? `-${row.amount}` : row.amount, true)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className={styles.block}>
                <h2 className={styles.blockTitle}>{t('reports.byCurrencyTitle')}</h2>
                {(data?.byCurrency.length ?? 0) === 0 ? (
                  <p className={styles.empty}>{t('reports.noData')}</p>
                ) : (
                  <StackedBar
                    segments={(data?.byCurrency ?? []).map((row, index) => ({
                      key: row.currencyCode,
                      label: row.currencyCode,
                      share: row.share,
                      value: money(row.amount),
                      color: seriesColor(index),
                    }))}
                  />
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
