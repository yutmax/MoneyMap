import { formatMoney, isNegative, toDecimal, todayIn } from '@moneymap/shared';
import { useMemo, useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import { csvUrl, useCashflowReport, useCategoryReport, useReportSummary } from '@/entities/report';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { Alert, BarList, ColumnChart, Select, seriesColor, Spinner, StackedBar } from '@/shared/ui';
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

export function ReportsPage() {
  const { t, locale } = useT();
  const { user } = useMe();
  const currencies = useCurrencies();
  const [range, setRange] = useState<Range>('month');

  const today = todayIn(user?.timezone ?? 'UTC');
  const period = useMemo(() => periodOf(range, today), [range, today]);

  const summary = useReportSummary(period);
  const expenses = useCategoryReport(period, 'expense');
  const cashflow = useCashflowReport(period);

  const base = summary.data?.baseCurrency ?? user?.baseCurrency ?? '';
  const currency = currencies.data?.find((c) => c.code === base);

  const money = (amount: string) =>
    formatMoney(amount, {
      currency: base,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });

  /** Подписи оси: без копеек — в шкале они только мешают читать. */
  const tick = (value: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  const categories = expenses.data?.categories ?? [];
  const maxCategory = categories.length > 0 ? toDecimal(categories[0]!.amount).toNumber() : 0;

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

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('reports.title')}</h1>
          <p className={styles.subtitle}>
            {t('reports.period', {
              from: formatDate(period.from, locale),
              to: formatDate(period.to, locale),
            })}
          </p>
        </div>

        <div className={styles.controls}>
          <Select
            label={t('reports.range')}
            value={range}
            onChange={(e) => setRange(e.currentTarget.value as Range)}
          >
            {RANGES.map((value) => (
              <option key={value} value={value}>
                {t(`reports.ranges.${value}`)}
              </option>
            ))}
          </Select>

          {/* Обычная ссылка, а не fetch с Blob: файл отдаёт сервер
              заголовком Content-Disposition, и браузер умеет это сам. */}
          <a className={styles.export} href={csvUrl(period)} download>
            {t('reports.export')}
          </a>
        </div>
      </header>

      {summary.isError && <Alert>{t('reports.loadFailed')}</Alert>}

      {summary.isPending && !summary.data ? (
        <Spinner />
      ) : (
        <>
          <section className={styles.totals}>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.income')}</p>
              <p className={cx(styles.tileValue, styles.income)}>
                {money(summary.data?.income ?? '0')}
              </p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.expense')}</p>
              <p className={styles.tileValue}>{money(summary.data?.expense ?? '0')}</p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.net')}</p>
              <p
                className={cx(
                  styles.tileValue,
                  isNegative(summary.data?.net ?? '0') ? styles.negative : styles.income,
                )}
              >
                {money(summary.data?.net ?? '0')}
              </p>
            </article>
            <article className={styles.tile}>
              <p className={styles.tileLabel}>{t('reports.count')}</p>
              <p className={styles.tileValue}>{summary.data?.count ?? 0}</p>
            </article>
          </section>

          {months.length > 0 && (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('reports.cashflowTitle')}</h2>
              <ColumnChart
                points={months}
                series={[
                  { name: t('reports.income'), color: 'var(--c-income)' },
                  { name: t('reports.expense'), color: 'var(--c-expense)' },
                ]}
                formatTick={tick}
              />
            </section>
          )}

          <div className={styles.columns}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('reports.byCategoryTitle')}</h2>
              {categories.length === 0 ? (
                <p className={styles.empty}>{t('reports.noData')}</p>
              ) : (
                <BarList
                  items={categories.map((row) => ({
                    key: row.categoryId ?? 'none',
                    label: row.categoryName ?? t('transactions.categoryNone'),
                    value: money(row.amount),
                    hint: `${Math.round(row.share * 100)}%`,
                    ratio: maxCategory === 0 ? 0 : toDecimal(row.amount).toNumber() / maxCategory,
                  }))}
                />
              )}
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('reports.byCurrencyTitle')}</h2>
              {(summary.data?.byCurrency.length ?? 0) === 0 ? (
                <p className={styles.empty}>{t('reports.noData')}</p>
              ) : (
                <StackedBar
                  segments={(summary.data?.byCurrency ?? []).map((row, index) => ({
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

          {(summary.data?.largest.length ?? 0) > 0 && (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('reports.largestTitle')}</h2>
              <ul className={styles.largest}>
                {summary.data?.largest.map((row) => (
                  <li key={row.id} className={styles.largestRow}>
                    <time className={styles.date} dateTime={row.occurredOn}>
                      {formatDate(row.occurredOn, locale)}
                    </time>
                    <span className={styles.largestName}>
                      {row.categoryName ?? t('transactions.categoryNone')}
                      <span className={styles.account}>{row.accountName}</span>
                    </span>
                    <span
                      className={cx(
                        styles.largestAmount,
                        row.kind === 'income' ? styles.income : undefined,
                      )}
                    >
                      {row.kind === 'expense' ? '−' : '+'}
                      {money(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
