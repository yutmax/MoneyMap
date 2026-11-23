import { formatMoney, isNegative } from '@moneymap/shared';
import { Link } from 'react-router';
import { accountTypeIcon, useAccounts } from '@/entities/account';
import { useCurrencies } from '@/entities/currency';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import styles from './AccountsOverview.module.scss';

/**
 * Счета на главной — коротким списком, каждый в своей валюте.
 *
 * Итог сверху отвечает «сколько всего», а этот список — «где именно»:
 * без него, чтобы узнать остаток на карте, приходилось уходить в раздел
 * счетов. Архивные не показываются — на главной им не место.
 */
export function AccountsOverview() {
  const { t, locale } = useT();
  const accounts = useAccounts();
  const currencies = useCurrencies();
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
        <ul className={styles.list}>
          {list.map((account) => {
            const meta = currencies.data?.find((c) => c.code === account.currencyCode);
            return (
              <li key={account.id} className={styles.row}>
                <span className={styles.icon}>
                  <Icon name={accountTypeIcon(account.type)} className={styles.glyph} />
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
