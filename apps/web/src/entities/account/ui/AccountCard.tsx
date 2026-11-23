import { formatMoney, isNegative, type AccountResponse } from '@moneymap/shared';
import type { CSSProperties } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import { accountTypeIcon } from '../lib/type-icon.ts';
import styles from './AccountCard.module.scss';

interface AccountCardProps {
  account: AccountResponse;
  /** Цвет плитки значка и полосы доли. Свой цвет счёта сильнее переданного. */
  color: string;
  /** Доля счёта в общем балансе, 0..1. Без неё полоса не рисуется. */
  share?: number | undefined;
  /** Нажатие открывает счёт: там правка, архив и удаление. */
  onOpen?: (account: AccountResponse) => void;
}

/**
 * Карточка счёта: значок типа, название, остаток и доля в общем балансе.
 *
 * Счетов у человека единицы, а не сотни, поэтому это карточки, а не строки
 * таблицы: у каждой есть место под крупный остаток и полосу доли, и «где
 * лежит основная часть денег» видно без чтения чисел.
 *
 * Кнопок в карточке нет. «Изменить», «Архивировать» и «Удалить» нужны
 * редко — все три в окне, которое открывается по нажатию.
 */
export function AccountCard({ account, color, share, onOpen }: AccountCardProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();

  // Число знаков берётся из справочника: у BYN их два, у BTC восемь.
  // Пока справочник не доехал, показываем два — это верно для всех фиатных
  // валют и не мигает лишним нулём при загрузке.
  const currency = currencies.data?.find((c) => c.code === account.currencyCode);
  const decimals = currency?.decimals ?? 2;
  const tile = { '--tile': account.color ?? color } as CSSProperties;
  const percent = share === undefined ? null : Math.round(share * 100);

  const body = (
    <>
      <span className={styles.top}>
        <span className={styles.icon}>
          <Icon name={accountTypeIcon(account.type)} className={styles.glyph} />
        </span>
        <span className={styles.kind}>
          {t(`accounts.type_${account.type}`)} · {account.currencyCode}
        </span>
      </span>

      <span className={styles.name}>{account.name}</span>

      <span className={cx(styles.balance, isNegative(account.balance) && styles.negative)}>
        {formatMoney(account.balance, {
          currency: account.currencyCode,
          decimals,
          locale,
          ...(currency?.symbol ? { symbol: currency.symbol } : {}),
        })}
      </span>

      {percent !== null && (
        <span className={styles.share}>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.fill} style={{ inlineSize: `${Math.max(percent, 0)}%` }} />
          </span>
          <span className={styles.percent}>{t('accounts.shareOfTotal', { percent })}</span>
        </span>
      )}
    </>
  );

  return (
    <li className={cx(styles.root, account.isArchived && styles.archived)} style={tile}>
      {onOpen ? (
        <button type="button" className={styles.card} onClick={() => onOpen(account)}>
          {body}
        </button>
      ) : (
        <div className={styles.card}>{body}</div>
      )}
    </li>
  );
}
