import { formatMoney, isNegative, type AccountResponse } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './AccountCard.module.scss';

interface AccountCardProps {
  account: AccountResponse;
  /** Кнопки приходят снаружи: действия живут в features. */
  actions?: ReactNode;
}

export function AccountCard({ account, actions }: AccountCardProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();

  // Число знаков берётся из справочника: у BYN их два, у BTC восемь.
  // Пока справочник не доехал, показываем два — это верно для всех фиатных
  // валют и не мигает лишним нулём при загрузке.
  const decimals = currencies.data?.find((c) => c.code === account.currencyCode)?.decimals ?? 2;

  return (
    <li className={cx(styles.root, account.isArchived && styles.archived)}>
      <div className={styles.info}>
        <p className={styles.name}>
          {account.color && (
            <span className={styles.dot} style={{ backgroundColor: account.color }} />
          )}
          {account.name}
        </p>
        <p className={styles.meta}>
          {t(`accounts.type_${account.type}`)}
          {account.isArchived && ` · ${t('accounts.archived')}`}
        </p>
      </div>

      <p className={cx(styles.balance, isNegative(account.balance) && styles.negative)}>
        {formatMoney(account.balance, {
          currency: account.currencyCode,
          decimals,
          locale,
        })}
      </p>

      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
