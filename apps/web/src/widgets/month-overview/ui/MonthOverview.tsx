import { formatMoney, isNegative, isZero, quantize, todayIn, toDecimal } from '@moneymap/shared';
import { Link } from 'react-router';
import { categoryNameOrNull, useCategoryColor } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useReportSummary } from '@/entities/report';
import { useMe } from '@/entities/user';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, restColor } from '@/shared/ui';
import styles from './MonthOverview.module.scss';

/** Сколько категорий показывать поимённо: остальные сворачиваются в «остальное». */
const TOP = 4;

/** Отчёт за текущий месяц — один запрос на оба блока. */
function useMonthReport() {
  const { user } = useMe();
  const today = todayIn(user?.timezone ?? 'UTC');
  const period = { from: `${today.slice(0, 8)}01`, to: today };
  return { today, period, report: useReportSummary(period) };
}

/**
 * Суммы обзора без копеек: это прикидка «как идёт месяц», и дробная часть
 * только удлиняет число. Валюте без дробной части (иене) округлять и так
 * нечего, а у крипты месячный итог в базовой валюте всё равно фиатный.
 */
function useMoney() {
  const { locale } = useT();
  const currencies = useCurrencies();
  return (amount: string, code: string, signed = false) => {
    const meta = currencies.data?.find((item) => item.code === code);
    return formatMoney(quantize(amount, 0), {
      currency: code,
      decimals: 0,
      locale,
      ...(signed && !isZero(amount) ? { signDisplay: 'always' as const } : {}),
      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
    });
  };
}

/** Сколько дней осталось до конца месяца, не считая сегодняшний. */
function daysLeft(today: string): number {
  const [year, month, day] = today.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate() - day;
}

/**
 * Текущий месяц одной карточкой: доход, расход, какая часть дохода уже
 * потрачена и сколько остаётся.
 *
 * Три отдельные плитки отвечали на «сколько пришло» и «сколько ушло», но
 * не на «как идёт месяц»: соотнести два числа человек должен был сам.
 * Полоса делает это за него, а подпись с числом дней говорит, сколько ещё
 * этим остатком жить.
 */
export function MonthCard() {
  const { t, locale } = useT();
  const money = useMoney();
  const { today, period, report } = useMonthReport();
  const data = report.data;
  const base = data?.baseCurrency ?? '';

  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${period.from}T00:00:00Z`),
  );

  const income = data ? toDecimal(data.income) : null;
  const spent =
    data && income && income.gt(0)
      ? Math.round(toDecimal(data.expense).div(income).times(100).toNumber())
      : null;
  const left = daysLeft(today);

  return (
    <section className={styles.card} aria-label={month}>
      <header className={styles.cardHeader}>
        <h2 className={styles.eyebrow}>{month}</h2>
        <span className={styles.faint}>
          {left > 0 ? t('dashboard.daysLeft', { count: left }) : t('dashboard.lastDay')}
        </span>
      </header>

      <div className={styles.pair}>
        <div>
          <p className={styles.faint}>{t('dashboard.income')}</p>
          <p className={cx(styles.kpi, styles.income)}>
            {data ? money(data.income, base, true) : '—'}
          </p>
        </div>
        <div className={styles.end}>
          <p className={styles.faint}>{t('dashboard.expense')}</p>
          <p className={styles.kpi}>
            {data ? money(isZero(data.expense) ? '0' : `-${data.expense}`, base) : '—'}
          </p>
        </div>
      </div>

      <div>
        <div
          className={styles.meter}
          role="img"
          aria-label={
            spent === null
              ? t('dashboard.noIncome')
              : t('dashboard.spentOfIncome', { percent: spent })
          }
        >
          <span
            className={cx(styles.meterFill, spent !== null && spent > 100 && styles.over)}
            style={{ inlineSize: `${Math.min(spent ?? 0, 100)}%` }}
          />
        </div>
        <p className={styles.meterNote}>
          {spent === null
            ? t('dashboard.noIncome')
            : t('dashboard.spentOfIncome', { percent: spent })}
        </p>
      </div>

      <footer className={styles.cardFooter}>
        <div>
          <p className={styles.faint}>{t('dashboard.left')}</p>
          <p className={cx(styles.kpi, data && isNegative(data.net) && styles.expense)}>
            {data ? money(data.net, base) : '—'}
          </p>
        </div>
        <Link to={ROUTES.reports} className={styles.button}>
          {t('dashboard.report')}
          <Icon name="chevron-right" className={styles.buttonIcon} />
        </Link>
      </footer>
    </section>
  );
}

/**
 * На что ушли деньги за месяц: полоса долей и четыре главные категории.
 *
 * Полоса показывает картину целиком — одна категория съела половину или
 * траты размазаны ровно, — список под ней называет главных. Цвет у
 * категории тот же, что у её значка в ленте и строки в отчётах.
 */
export function WhereMoneyWent() {
  const { t } = useT();
  const money = useMoney();
  const color = useCategoryColor();
  const { report } = useMonthReport();
  const data = report.data;
  const base = data?.baseCurrency ?? '';

  const top = (data?.topExpenseCategories ?? []).slice(0, TOP);

  // Остаток считается от общего расхода, а не от хвоста списка: сервер
  // отдаёт только первые категории, и сумма «остальных» в ответе неполная.
  const topAmount = top.reduce((total, row) => total.plus(toDecimal(row.amount)), toDecimal('0'));
  const restAmount = toDecimal(data?.expense ?? '0').minus(topAmount);
  const restShare = Math.max(1 - top.reduce((total, row) => total + row.share, 0), 0);
  const hasRest = top.length > 0 && restAmount.gt(0);

  const rows = [
    ...top.map((row) => ({
      key: row.categoryId ?? 'none',
      name: categoryNameOrNull(t, row.categoryKey) ?? t('transactions.categoryNone'),
      share: row.share,
      amount: row.amount,
      color: color(row.categoryId),
      muted: false,
    })),
    ...(hasRest
      ? [
          {
            key: 'rest',
            name: t('dashboard.otherCategories'),
            share: restShare,
            amount: restAmount.toString(),
            color: restColor,
            muted: true,
          },
        ]
      : []),
  ];

  return (
    <section className={styles.card} aria-labelledby="where-money-went-title">
      <header className={styles.cardHeader}>
        <h2 className={styles.blockTitle} id="where-money-went-title">
          {t('dashboard.whereMoneyWent')}
        </h2>
        <Link to={ROUTES.reports} className={styles.more}>
          {t('dashboard.toReports')}
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className={styles.empty}>{t('dashboard.noSpending')}</p>
      ) : (
        <>
          <div className={styles.stack} aria-hidden="true">
            {rows.map((row) => (
              <span
                key={row.key}
                className={styles.segment}
                style={{ flexGrow: Math.max(row.share * 100, 2), backgroundColor: row.color }}
              />
            ))}
          </div>

          <ul className={styles.legend}>
            {rows.map((row) => (
              <li key={row.key} className={styles.legendRow}>
                <span className={styles.dot} style={{ backgroundColor: row.color }} />
                <span className={cx(styles.legendName, row.muted && styles.muted)}>{row.name}</span>
                <span className={styles.share}>{Math.round(row.share * 100)}%</span>
                <span className={styles.amount}>{money(row.amount, base)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
