import { formatMoney, isNegative, type TransactionResponse } from '@moneymap/shared';
import type { CSSProperties } from 'react';
import { categoryColor, categoryNameOrNull, useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, isIconName, type IconName } from '@/shared/ui';
import styles from './TransactionRow.module.scss';

interface TransactionRowProps {
  transaction: TransactionResponse;
  /** Нажатие на строку открывает операцию. Без него строка просто читается. */
  onOpen?: (transaction: TransactionResponse) => void;
  /**
   * Табличная раскладка для широкого экрана: счёт и заметка встают в свои
   * колонки. На узком экране строка остаётся прежней — две строки текста и
   * сумма, — колонки там просто не поместятся.
   */
  columns?: boolean;
  /** Строка, чьи подробности сейчас открыты рядом. */
  selected?: boolean;
}

/**
 * Строка операции: значок категории, название со счётом, сумма справа.
 *
 * Ни рамки, ни кнопок у строки нет. Рамка вокруг каждой операции делала
 * ленту стопкой коробок, а «Изменить» и «Удалить» в каждой строке — шумом
 * ради действий, которые нужны раз в неделю. Теперь строка сама кнопка:
 * нажал — открыл, а удалить можно в открывшемся окне.
 */
export function TransactionRow({
  transaction,
  onOpen,
  columns = false,
  selected = false,
}: TransactionRowProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();
  const categories = useCategories();
  const currency = currencies.data?.find((c) => c.code === transaction.accountCurrency);
  const original = currencies.data?.find((c) => c.code === transaction.currencyOriginal);

  const negative = isNegative(transaction.amountAccount);
  const transfer = transaction.kind === 'transfer';
  // Операция в чужой валюте показывает обе суммы: в валюте счёта считается
  // баланс, а в валюте чека человек её и запомнил (§8.5).
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

  // Плитка значка красится цветом категории — тем же, что у её строки в
  // отчётах. Перевод остаётся нейтральным: это не трата и не доход.
  const tile = transfer
    ? undefined
    : ({ '--tile': categoryColor(transaction.categoryId, categories.data) } as CSSProperties);

  const body = (
    <>
      <span
        className={cx(
          styles.icon,
          transaction.kind === 'income' && styles.iconIncome,
          transfer && styles.iconTransfer,
        )}
        style={tile}
      >
        <Icon name={icon} className={styles.glyph} />
      </span>

      <span className={styles.info}>
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>
          {transaction.note ? `${transaction.note} · ` : ''}
          {transaction.accountName}
        </span>
      </span>

      {columns && (
        <>
          <span className={styles.cell}>{transaction.accountName}</span>
          <span className={styles.cell}>{transaction.note ?? '—'}</span>
        </>
      )}

      <span className={styles.amounts}>
        <span className={cx(styles.amount, !negative && styles.positive)}>
          {formatMoney(transaction.amountAccount, {
            currency: transaction.accountCurrency,
            decimals: currency?.decimals ?? 2,
            locale,
            // Плюс у поступления показывается явно: в списке, где соседствуют
            // доходы и расходы, отсутствие минуса — слишком тихий признак.
            signDisplay: 'always',
            ...(currency?.symbol ? { symbol: currency.symbol } : {}),
          })}
        </span>

        {foreign && (
          <span className={styles.original}>
            {formatMoney(transaction.amountOriginal, {
              currency: transaction.currencyOriginal,
              decimals: original?.decimals ?? 2,
              locale,
              ...(original?.symbol ? { symbol: original.symbol } : {}),
            })}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li className={cx(styles.root, columns && styles.columns, selected && styles.selected)}>
      {onOpen ? (
        <button
          type="button"
          className={styles.row}
          onClick={() => onOpen(transaction)}
          aria-current={selected ? 'true' : undefined}
        >
          {body}
        </button>
      ) : (
        <div className={styles.row}>{body}</div>
      )}
    </li>
  );
}
