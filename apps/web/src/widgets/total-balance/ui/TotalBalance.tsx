import { formatMoney, isNegative, isZero, subtract } from '@moneymap/shared';
import { lazy, Suspense, useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useNetWorth, useSummary } from '@/entities/summary';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, Select, Spinner } from '@/shared/ui';
import styles from './TotalBalance.module.scss';

/**
 * График подгружается отдельным кусочком: recharts весит заметно, и ждать
 * его ради первого экрана незачем — цифра баланса важнее линии под ней.
 */
const NetWorthChart = lazy(() =>
  import('./NetWorthChart.tsx').then((module) => ({ default: module.NetWorthChart })),
);

/**
 * Главный блок главной: сводный баланс, его изменение и линия за месяц (§8.6).
 *
 * Одна карточка на весь ответ «сколько у меня и куда оно движется»: число,
 * рядом — на сколько оно изменилось, под ними — график во всю ширину. Раньше
 * эти три вещи стояли на фоне страницы без общей рамки и читались как три
 * разных блока.
 *
 * Валюта отображения переключается здесь же и ничего не меняет в данных:
 * счета остаются в своих валютах, пересчитывается только итог. Разбивки по
 * валютам здесь больше нет — долю каждого счёта показывает лента счетов ниже.
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

  const money = (amount: string, signed = false) =>
    formatMoney(amount, {
      currency: base,
      decimals,
      locale,
      ...(signed && !isZero(amount) ? { signDisplay: 'always' as const } : {}),
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });

  // Месяц: длиннее — линия сжимается в кардиограмму, короче — по ней нечего
  // отслеживать.
  const month = (netWorth.data?.points ?? []).slice(-31);

  // Нули до первого дня, когда деньги появились, отрезаются, но один
  // оставляется: без него график начинается с обрыва.
  const firstMoney = month.findIndex((point) => !isZero(point.total));
  const points = firstMoney <= 0 ? month : month.slice(firstMoney - 1);

  const first = points[0];
  const last = points.at(-1);
  const change = first && last && points.length > 1 ? subtract(last.total, first.total) : null;

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
            variant="pill"
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
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : (
        <>
          <div className={styles.figure}>
            <p
              className={cx(styles.total, data && isNegative(data.total) && styles.negative)}
              // Итог обновляется при смене валюты без перезагрузки страницы:
              // без этого скринридер о замене цифры не сообщит.
              aria-live="polite"
            >
              {data ? money(data.total) : money('0')}
            </p>

            {change !== null && (
              <span className={cx(styles.delta, isNegative(change) && styles.deltaDown)}>
                <Icon name="trending-up" className={styles.deltaIcon} />
                {t('summary.changeChip', { amount: money(change, true), days: points.length })}
              </span>
            )}
          </div>

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

          {data && data.byCurrency.length === 0 && (
            <p className={styles.note}>{t('summary.empty')}</p>
          )}

          {points.length > 1 ? (
            <div className={styles.chart}>
              <Suspense fallback={<div className={styles.chartPlaceholder} />}>
                <NetWorthChart
                  points={points}
                  currency={base}
                  decimals={decimals}
                  symbol={currency?.symbol}
                />
              </Suspense>
            </div>
          ) : (
            <div className={styles.spacer} />
          )}
        </>
      )}
    </section>
  );
}
