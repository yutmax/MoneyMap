import { formatMoney, isNegative } from '@moneymap/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { accountTypeIcon, useAccounts } from '@/entities/account';
import { useCurrencies } from '@/entities/currency';
import { useSummary } from '@/entities/summary';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, seriesColor } from '@/shared/ui';
import styles from './AccountsOverview.module.scss';

/**
 * Счета на главной — карточками, каждый в своей валюте.
 *
 * Итог сверху отвечает «сколько всего», а карточки — «где именно»: остаток
 * каждого счёта и его доля в общем балансе. Раньше счета стояли списком в
 * боковой колонке, под операциями, и главный после итога вопрос оказывался
 * в самом низу экрана. На телефоне карточки идут по две в ряд, на широком
 * экране делят строку поровну.
 *
 * Архивные не показываются — на главной им не место.
 */
export function AccountsOverview() {
  const { t, locale } = useT();
  const accounts = useAccounts();
  const currencies = useCurrencies();
  const summary = useSummary();
  const list = (accounts.data ?? []).filter((account) => !account.isArchived);

  return (
    <section className={styles.root} aria-labelledby="accounts-overview-title">
      <header className={styles.header}>
        <h2 className={styles.title} id="accounts-overview-title">
          {t('dashboard.accounts')}
        </h2>
        <Link to={ROUTES.accounts} className={styles.more}>
          {t('dashboard.allAccounts')}
        </Link>
      </header>

      {list.length === 0 ? (
        <p className={styles.empty}>{t('accounts.empty')}</p>
      ) : (
        <ul className={styles.strip}>
          {list.map((account, index) => {
            const meta = currencies.data?.find((c) => c.code === account.currencyCode);
            const bucket = summary.data?.byAccount.find((item) => item.accountId === account.id);
            // Цвет счёта — выбранный человеком, а без него шаг палитры по
            // порядку: плитка значка отличает счета раньше, чем прочитано имя.
            const tile = { '--tile': account.color ?? seriesColor(index) } as CSSProperties;

            return (
              <li key={account.id} className={styles.item}>
                <Link to={ROUTES.accounts} className={styles.card}>
                  <span className={styles.top}>
                    <span className={styles.icon} style={tile}>
                      <Icon name={accountTypeIcon(account.type)} className={styles.glyph} />
                    </span>
                    <span className={styles.code}>
                      {bucket
                        ? t('dashboard.shareOfTotal', {
                            code: account.currencyCode,
                            percent: Math.round(bucket.share * 100),
                          })
                        : account.currencyCode}
                    </span>
                  </span>
                  <span className={styles.name}>{account.name}</span>
                  <span
                    className={cx(styles.balance, isNegative(account.balance) && styles.negative)}
                  >
                    {formatMoney(account.balance, {
                      currency: account.currencyCode,
                      decimals: meta?.decimals ?? 2,
                      locale,
                      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
