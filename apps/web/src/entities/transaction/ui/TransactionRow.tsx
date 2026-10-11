import { formatMoney, isNegative, type TransactionResponse } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import styles from './TransactionRow.module.scss';

interface TransactionRowProps {
  transaction: TransactionResponse;
  actions?: ReactNode;
}

export function TransactionRow({ transaction, actions }: TransactionRowProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();
  const currency = currencies.data?.find((c) => c.code === transaction.accountCurrency);
  const original = currencies.data?.find((c) => c.code === transaction.currencyOriginal);

  const negative = isNegative(transaction.amountAccount);
  // Операция в чужой валюте показывает обе суммы: в валюте счёта считается
  // баланс, а в валюте чека человек её и запомнил (§8.5).
  const foreign = transaction.currencyOriginal !== transaction.accountCurrency;

  return (
    <li className={styles.root}>
      <div className={styles.info}>
        <p className={styles.title}>
          {transaction.kind === 'transfer'
            ? t('transactions.transfer')
            : (transaction.categoryName ?? t('transactions.noCategory'))}
        </p>
        <p className={styles.meta}>
          {transaction.accountName}
          {transaction.note && ` · ${transaction.note}`}
        </p>
      </div>

      <time className={styles.date} dateTime={transaction.occurredOn}>
        {formatDate(transaction.occurredOn, locale)}
      </time>

      <div className={styles.amounts}>
        <p className={cx(styles.amount, negative ? styles.negative : styles.positive)}>
          {formatMoney(transaction.amountAccount, {
            currency: transaction.accountCurrency,
            decimals: currency?.decimals ?? 2,
            locale,
            // Плюс у поступления показывается явно: в списке, где соседствуют
            // доходы и расходы, отсутствие минуса — слишком тихий признак.
            signDisplay: 'always',
            ...(currency?.symbol ? { symbol: currency.symbol } : {}),
          })}
        </p>

        {foreign && (
          <p className={styles.original}>
            {formatMoney(transaction.amountOriginal, {
              currency: transaction.currencyOriginal,
              decimals: original?.decimals ?? 2,
              locale,
              ...(original?.symbol ? { symbol: original.symbol } : {}),
            })}
          </p>
        )}
      </div>

      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
