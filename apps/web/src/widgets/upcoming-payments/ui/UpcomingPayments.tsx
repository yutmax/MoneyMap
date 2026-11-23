import { formatMoney } from '@moneymap/shared';
import { Link } from 'react-router';
import { useCurrencies } from '@/entities/currency';
import { useUpcoming } from '@/entities/recurring';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './UpcomingPayments.module.scss';

/** Сколько ближайших срабатываний показывать: дальше — раздел регулярных. */
const LIMIT = 3;

/**
 * Ближайшие регулярные операции на главной.
 *
 * Главная до сих пор смотрела только назад: что пришло и что ушло. Этот
 * блок отвечает на вопрос, ради которого остаток вообще проверяют, — «что
 * ещё спишется до конца месяца». День стоит крупно, как в календаре: дата
 * здесь важнее названия.
 */
export function UpcomingPayments() {
  const { t, locale } = useT();
  const upcoming = useUpcoming(30);
  const currencies = useCurrencies();
  const list = (upcoming.data ?? []).slice(0, LIMIT);

  const parts = (iso: string) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return {
      day: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(date),
      month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', ''),
    };
  };

  return (
    <section className={styles.root} aria-labelledby="upcoming-title">
      <header className={styles.header}>
        <h2 className={styles.title} id="upcoming-title">
          {t('dashboard.upcoming')}
        </h2>
        <Link to={ROUTES.recurring} className={styles.more}>
          {t('dashboard.toRecurring')}
        </Link>
      </header>

      {list.length === 0 ? (
        <p className={styles.empty}>{t('dashboard.upcomingEmpty')}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((item) => {
            const meta = currencies.data?.find((c) => c.code === item.currencyCode);
            const date = parts(item.dueOn);
            const income = item.kind === 'income';

            return (
              <li key={`${item.ruleId}-${item.dueOn}`} className={styles.row}>
                <time className={styles.date} dateTime={item.dueOn}>
                  <span className={styles.day}>{date.day}</span>
                  <span className={styles.month}>{date.month}</span>
                </time>
                <span className={styles.info}>
                  <span className={styles.name}>{item.ruleName}</span>
                  <span className={styles.meta}>{item.accountName}</span>
                </span>
                <span className={cx(styles.amount, income && styles.income)}>
                  {formatMoney(income ? item.amount : `-${item.amount}`, {
                    currency: item.currencyCode,
                    decimals: meta?.decimals ?? 2,
                    locale,
                    signDisplay: 'always',
                    ...(meta?.symbol ? { symbol: meta.symbol } : {}),
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
