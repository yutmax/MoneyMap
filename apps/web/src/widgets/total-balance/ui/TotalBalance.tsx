import { formatMoney, isNegative, type CurrencyBucket } from '@moneymap/shared';
import { useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useNetWorth, useSummary } from '@/entities/summary';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Select, Spinner } from '@/shared/ui';
import { Sparkline } from './Sparkline.tsx';
import styles from './TotalBalance.module.scss';

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

  const points = netWorth.data?.points ?? [];

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
            <Sparkline
              points={points}
              label={t('summary.chart', {
                from: points[0]?.date ?? '',
                to: points.at(-1)?.date ?? '',
              })}
            />
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
            <ul className={styles.breakdown}>
              {data.byCurrency.map((bucket: CurrencyBucket) => (
                <li className={styles.row} key={bucket.currencyCode}>
                  <span className={styles.code}>{bucket.currencyCode}</span>
                  <span className={styles.own}>{money(bucket.total, bucket.currencyCode)}</span>
                  <span className={styles.converted}>
                    {bucket.currencyCode === base ? '' : money(bucket.totalBase)}
                  </span>
                  <span className={styles.share}>
                    {/* Доля в процентах без знаков после запятой: 55,6 %
                        и 56 % говорят одно и то же, второе читается быстрее. */}
                    {Math.round(bucket.share * 100)}%
                  </span>
                  {/* Долг — это тоже доля, но другого знака: одинаковый цвет
                      у остатка и у задолженности делал бы полосы под строками
                      бессмысленными. */}
                  <span
                    className={cx(styles.bar, isNegative(bucket.totalBase) && styles.barNegative)}
                    style={{ inlineSize: `${Math.max(bucket.share * 100, 1)}%` }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>{t('summary.empty')}</p>
          )}
        </>
      )}
    </section>
  );
}
