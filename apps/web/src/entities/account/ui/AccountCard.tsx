import { formatMoney, isNegative, type AccountResponse } from '@moneymap/shared';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import { accountTypeIcon } from '../lib/type-icon.ts';
import styles from './AccountCard.module.scss';

interface AccountCardProps {
  account: AccountResponse;
  /** Нажатие открывает счёт: там правка, архив и удаление. */
  onOpen?: (account: AccountResponse) => void;
}

/**
 * Строка счёта: значок типа, название, остаток.
 *
 * Как и у операций, кнопок в строке нет. «Изменить», «Архивировать» и
 * «Удалить» в каждой строке втроём занимали больше места, чем сам счёт, а
 * нужны они редко — теперь все три в окне, которое открывается по нажатию.
 */
export function AccountCard({ account, onOpen }: AccountCardProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();

  // Число знаков берётся из справочника: у BYN их два, у BTC восемь.
  // Пока справочник не доехал, показываем два — это верно для всех фиатных
  // валют и не мигает лишним нулём при загрузке.
  const currency = currencies.data?.find((c) => c.code === account.currencyCode);
  const decimals = currency?.decimals ?? 2;

  const body = (
    <>
      <span className={styles.icon}>
        <Icon name={accountTypeIcon(account.type)} className={styles.glyph} />
      </span>

      <span className={styles.info}>
        <span className={styles.name}>
          {account.color && (
            <span className={styles.dot} style={{ backgroundColor: account.color }} />
          )}
          {account.name}
        </span>
        <span className={styles.meta}>
          {t(`accounts.type_${account.type}`)} · {account.currencyCode}
        </span>
      </span>

      <span className={cx(styles.balance, isNegative(account.balance) && styles.negative)}>
        {formatMoney(account.balance, {
          currency: account.currencyCode,
          decimals,
          locale,
          ...(currency?.symbol ? { symbol: currency.symbol } : {}),
        })}
      </span>
    </>
  );

  return (
    <li className={cx(styles.root, account.isArchived && styles.archived)}>
      {onOpen ? (
        <button type="button" className={styles.row} onClick={() => onOpen(account)}>
          {body}
        </button>
      ) : (
        <div className={styles.row}>{body}</div>
      )}
    </li>
  );
}
