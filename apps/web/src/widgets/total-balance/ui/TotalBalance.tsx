import { formatMoney, isNegative } from '@moneymap/shared';
import { lazy, Suspense, useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useNetWorth, useSummary } from '@/entities/summary';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Select, seriesColor, Spinner, StackedBar } from '@/shared/ui';
import styles from './TotalBalance.module.scss';

/**
 * График подгружается отдельным кусочком: recharts весит заметно, и ждать
 * его ради первого экрана незачем — цифра баланса важнее линии под ней.
 */
const NetWorthChart = lazy(() =>
  import('./NetWorthChart.tsx').then((module) => ({ default: module.NetWorthChart })),
);

/**
 * Сводный баланс крупными цифрами (§8.6).
 *
 * Валюта отображения переключается здесь же и ничего не меняет в данных:
 * счета остаются в своих валютах, пересчитывается только итог. Выбор живёт
 * в состоянии компонента, а не в настройках пользователя — это взгляд
 * «а сколько это в долларах», а не смена базовой валюты учёта.
 */
export function TotalBalance() {
  const { t, locale } = useT();
  const { user } = useMe();
  const currencies = useCurrencies();

  // undefined — «как настроено у пользователя»: сервер сам возьмёт базовую
  // валюту, и до загрузки профиля ничего спрашивать не нужно.
  const [display, setDisplay] = useState<string | undefined>(undefined);
  const summary = useSummary(display);
  const netWorth = useNetWorth(display);

  const data = summary.data;
  const base = data?.baseCurrency ?? user?.baseCurrency ?? '';
  const currency = currencies.data?.find((item) => item.code === base);
  const decimals = currency?.decimals ?? 2;

  const money = (amount: string, code: string = base) => {
    const meta = currencies.data?.find((item) => item.code === code);
    return formatMoney(amount, {
      currency: code,
      decimals: meta?.decimals ?? decimals,
      locale,
      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
    });
  };

  // Месяц, как просили: длиннее — линия сжимается в кардиограмму, короче —
  // по ней нечего отслеживать.
  const points = (netWorth.data?.points ?? []).slice(-31);

  return (
    <section className={styles.root} aria-labelledby="total-balance-title">
      <header className={styles.header}>
        <h2 className={styles.title} id="total-balance-title">
          {t('summary.title')}
        </h2>

        {/* Обёртка, а не класс на Select: компонент намеренно не принимает
            className — иначе любой вызов мог бы переопределить его вид. */}
        <div className={styles.picker}>
          <Select
            label={t('summary.displayIn')}
            value={display ?? base}
            disabled={currencies.isPending}
            onChange={(event) => setDisplay(event.target.value)}
          >
            {(currencies.data ?? []).map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {summary.isPending && !data ? (
        <Spinner />
      ) : (
        <>
          <p
            className={cx(styles.total, data && isNegative(data.total) && styles.negative)}
            // Итог обновляется при смене валюты без перезагрузки страницы:
            // без этого скринридер о замене цифры не сообщит.
            aria-live="polite"
          >
            {data ? money(data.total) : money('0')}
          </p>

          {points.length > 1 && (
            <Suspense fallback={<div className={styles.chartPlaceholder} />}>
              <NetWorthChart
                points={points}
                currency={base}
                decimals={decimals}
                symbol={currency?.symbol}
              />
            </Suspense>
          )}

          {data && data.stale.length > 0 && (
            <p className={styles.note}>
              {t('summary.stale', { date: data.asOf, currencies: data.stale.join(', ') })}
            </p>
          )}

          {data && data.missing.length > 0 && (
            <p className={cx(styles.note, styles.warning)}>
              {t('summary.missing', { currencies: data.missing.join(', ') })}
            </p>
          )}

          {data && data.byCurrency.length > 0 ? (
            <StackedBar
              segments={data.byCurrency.map((bucket, index) => ({
                key: bucket.currencyCode,
                label: bucket.currencyCode,
                share: bucket.share,
                // В легенде валюта показана в себе самой: «2 370,57 Br»
                // человек узнаёт, а пересчёт в доллары стоит рядом в итоге.
                value: money(bucket.total, bucket.currencyCode),
                color: seriesColor(index),
                negative: isNegative(bucket.totalBase),
              }))}
            />
          ) : (
            <p className={styles.note}>{t('summary.empty')}</p>
          )}
        </>
      )}
    </section>
  );
}
