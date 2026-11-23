import { formatMoney, isNegative, quantize, todayIn } from '@moneymap/shared';
import { Link } from 'react-router';
import { categoryNameOrNull } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useReportSummary } from '@/entities/report';
import { useMe } from '@/entities/user';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './MonthOverview.module.scss';

/** Сколько категорий показывать в «главных тратах». */
const TOP = 5;

/**
 * Текущий месяц на главной: три числа и главные траты.
 *
 * Раньше главная отвечала только на «сколько у меня всего», а второй
 * вопрос, ради которого её открывают, — «как идёт месяц» — требовал
 * перехода в отчёты. Здесь тот же отчёт за месяц, но в двух блоках:
 * плитки с итогами идут под балансом, а траты — в боковую колонку.
 */
function useMonthReport() {
  const { user } = useMe();
  const today = todayIn(user?.timezone ?? 'UTC');
  const period = { from: `${today.slice(0, 8)}01`, to: today };
  return { period, report: useReportSummary(period) };
}

/**
 * Суммы обзора без копеек: это прикидка «как идёт месяц», и дробная часть
 * только удлиняет число — на телефоне три плитки в ряд обрезали его
 * многоточием. Валюте без дробной части (иене) округлять и так нечего,
 * а у крипты месячный итог в базовой валюте всё равно фиатный.
 */
function useMoney() {
  const { locale } = useT();
  const currencies = useCurrencies();
  return (amount: string, code: string) => {
    const meta = currencies.data?.find((item) => item.code === code);
    return formatMoney(quantize(amount, 0), {
      currency: code,
      decimals: 0,
      locale,
      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
    });
  };
}

export function MonthTiles() {
  const { t, locale } = useT();
  const money = useMoney();
  const { period, report } = useMonthReport();
  const data = report.data;
  const base = data?.baseCurrency ?? '';

  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${period.from}T00:00:00Z`),
  );

  const tiles = [
    { key: 'income', label: t('dashboard.income'), value: data?.income, tone: styles.income },
    { key: 'expense', label: t('dashboard.expense'), value: data?.expense, tone: undefined },
    {
      key: 'net',
      label: t('dashboard.net'),
      value: data?.net,
      tone: data && isNegative(data.net) ? styles.expense : undefined,
    },
  ];

  return (
    <section className={styles.tiles} aria-label={month}>
      {tiles.map((tile) => (
        <div key={tile.key} className={styles.tile}>
          <p className={styles.tileLabel}>
            {tile.label}
            <span className={styles.tileMonth}> · {month}</span>
          </p>
          <p className={cx(styles.tileValue, tile.tone)}>
            {tile.value !== undefined ? money(tile.value, base) : '—'}
          </p>
        </div>
      ))}
    </section>
  );
}

/**
 * Пять категорий, на которые ушло больше всего за месяц, тонкими полосками.
 *
 * Полоски, а не кольцо: в боковой колонке кольцо вышло бы с монету, а длину
 * глаз сравнивает точнее площади. Ширина — доля от самой крупной траты, не
 * от всех: иначе у первой строки полоска на треть, и сравнивать нечего.
 */
export function TopSpending() {
  const { t } = useT();
  const money = useMoney();
  const { report } = useMonthReport();
  const data = report.data;
  const top = (data?.topExpenseCategories ?? []).slice(0, TOP);
  const max = Math.max(...top.map((row) => row.share), 0);

  return (
    <section className={styles.block} aria-labelledby="top-spending-title">
      <header className={styles.blockHeader}>
        <h2 className={styles.blockTitle} id="top-spending-title">
          {t('dashboard.topSpending')}
        </h2>
        <Link to={ROUTES.reports} className={styles.more}>
          {t('dashboard.toReports')}
        </Link>
      </header>

      {top.length === 0 ? (
        <p className={styles.empty}>{t('dashboard.noSpending')}</p>
      ) : (
        <ul className={styles.bars}>
          {top.map((row) => (
            <li key={row.categoryId ?? 'none'} className={styles.bar}>
              <span className={styles.barName}>
                {categoryNameOrNull(t, row.categoryKey) ?? t('transactions.categoryNone')}
              </span>
              <span className={styles.barValue}>{money(row.amount, data?.baseCurrency ?? '')}</span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.fill}
                  style={{ inlineSize: `${max > 0 ? (row.share / max) * 100 : 0}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
