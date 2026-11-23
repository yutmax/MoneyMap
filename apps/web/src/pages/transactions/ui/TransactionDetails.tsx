import { formatMoney, isNegative, type TransactionResponse } from '@moneymap/shared';
import type { CSSProperties } from 'react';
import { categoryColor, categoryNameOrNull, useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { Button, Icon, isIconName, type IconName } from '@/shared/ui';
import styles from './TransactionDetails.module.scss';

interface TransactionDetailsProps {
  transaction: TransactionResponse;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * Подробности операции рядом с лентой — только на широком экране.
 *
 * Окно поверх страницы ради того, чтобы посмотреть дату и счёт, закрывало
 * саму ленту: сравнить две операции значило открыть, закрыть, открыть.
 * Здесь лента остаётся на месте, а подробности меняются по нажатию на
 * строку. Правка и удаление по-прежнему в окне — оно открывается отсюда.
 */
export function TransactionDetails({ transaction, onEdit, onClose }: TransactionDetailsProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();
  const categories = useCategories();

  const transfer = transaction.kind === 'transfer';
  const currency = currencies.data?.find((c) => c.code === transaction.accountCurrency);
  const original = currencies.data?.find((c) => c.code === transaction.currencyOriginal);
  const foreign = transaction.currencyOriginal !== transaction.accountCurrency;

  const categoryIcon = categories.data?.find((c) => c.id === transaction.categoryId)?.icon;
  const icon: IconName = transfer
    ? 'transactions'
    : categoryIcon && isIconName(categoryIcon)
      ? categoryIcon
      : 'circle-ellipsis';

  const title = transfer
    ? t('transactions.transfer')
    : (categoryNameOrNull(t, transaction.categoryKey) ?? t('transactions.noCategory'));

  const tile = transfer
    ? undefined
    : ({ '--tile': categoryColor(transaction.categoryId, categories.data) } as CSSProperties);

  return (
    <aside className={styles.root} aria-label={t('transactions.editTitle')}>
      <header className={styles.header}>
        <h2 className={styles.eyebrow}>{t('transactions.editTitle')}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('transactions.detailsClose')}
        >
          <Icon name="x" className={styles.closeIcon} />
        </button>
      </header>

      <div className={styles.lead}>
        <span className={cx(styles.icon, transfer && styles.iconTransfer)} style={tile}>
          <Icon name={icon} className={styles.glyph} />
        </span>
        <div className={styles.leadText}>
          <p className={styles.title}>{title}</p>
          <p className={styles.kind}>{t(`transactions.${transaction.kind}`)}</p>
        </div>
      </div>

      <p className={cx(styles.amount, !isNegative(transaction.amountAccount) && styles.positive)}>
        {formatMoney(transaction.amountAccount, {
          currency: transaction.accountCurrency,
          decimals: currency?.decimals ?? 2,
          locale,
          signDisplay: 'always',
          ...(currency?.symbol ? { symbol: currency.symbol } : {}),
        })}
      </p>

      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt>{t('transactions.date')}</dt>
          <dd>{formatDate(transaction.occurredOn, locale)}</dd>
        </div>
        <div className={styles.field}>
          <dt>{t('transactions.account')}</dt>
          <dd>
            {transaction.accountName} · {transaction.accountCurrency}
          </dd>
        </div>
        {!transfer && (
          <div className={styles.field}>
            <dt>{t('transactions.category')}</dt>
            <dd>{title}</dd>
          </div>
        )}
        {foreign && (
          <div className={styles.field}>
            <dt>{t('transactions.detailsOriginal')}</dt>
            <dd>
              {formatMoney(transaction.amountOriginal, {
                currency: transaction.currencyOriginal,
                decimals: original?.decimals ?? 2,
                locale,
                ...(original?.symbol ? { symbol: original.symbol } : {}),
              })}
            </dd>
          </div>
        )}
        <div className={styles.field}>
          <dt>{t('transactions.note')}</dt>
          <dd className={cx(!transaction.note && styles.none)}>
            {transaction.note ?? t('transactions.detailsNoNote')}
          </dd>
        </div>
      </dl>

      <Button variant="secondary" block onClick={onEdit}>
        {t('transactions.edit')}
      </Button>
    </aside>
  );
}
