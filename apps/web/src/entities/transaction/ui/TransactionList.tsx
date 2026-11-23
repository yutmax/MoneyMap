import { formatMoney, isZero, sum, todayIn, type TransactionResponse } from '@moneymap/shared';
import { useCurrencies } from '@/entities/currency';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { dayLabel } from '../lib/day-label.ts';
import { TransactionRow } from './TransactionRow.tsx';
import styles from './TransactionList.module.scss';

interface TransactionListProps {
  transactions: TransactionResponse[];
  onOpen?: (transaction: TransactionResponse) => void;
  /**
   * Показывать итог дня в его заголовке. Только там, где лента загружена
   * целиком по дням: на главной в ней шесть строк, и «итог» последнего дня
   * был бы суммой того, что поместилось.
   */
  totals?: boolean;
  /** Последний день может быть догружен не полностью — итог у него не считается. */
  partialLast?: boolean;
  /** Табличная раскладка строк на широком экране. */
  columns?: boolean;
  /** Операция, открытая рядом: её строка подсвечивается. */
  selectedId?: string | null;
}

/**
 * Лента операций, сгруппированная по дням.
 *
 * Дата ушла из строки в заголовок дня: семь раз подряд «22 нояб. 2026 г.»
 * посреди строк — не информация, а рябь, и из-за неё суммы не стояли
 * столбцом. Порядок не меняется: сервер уже отдаёт ленту от новых к старым,
 * здесь она только режется на дни.
 */
export function TransactionList({
  transactions,
  onOpen,
  totals = false,
  partialLast = false,
  columns = false,
  selectedId = null,
}: TransactionListProps) {
  const { t, locale } = useT();
  const { user } = useMe();
  const currencies = useCurrencies();
  const today = todayIn(user?.timezone ?? 'UTC');
  const words = { today: t('transactions.today'), yesterday: t('transactions.yesterday') };

  const days: Array<{ date: string; items: TransactionResponse[] }> = [];
  for (const transaction of transactions) {
    const last = days.at(-1);
    if (last?.date === transaction.occurredOn) last.items.push(transaction);
    else days.push({ date: transaction.occurredOn, items: [transaction] });
  }

  /**
   * Итог дня — только когда все его операции в одной валюте: складывать
   * доллары с евро без курса нельзя, а курс дня здесь взять неоткуда.
   * Переводы в сумму входят обеими половинами и гасят друг друга.
   */
  const dayTotal = (items: TransactionResponse[]): string | null => {
    const code = items[0]?.accountCurrency;
    if (!code || items.some((item) => item.accountCurrency !== code)) return null;
    const meta = currencies.data?.find((item) => item.code === code);
    const amount = sum(items.map((item) => item.amountAccount));
    return formatMoney(amount, {
      currency: code,
      decimals: meta?.decimals ?? 2,
      locale,
      signDisplay: isZero(amount) ? 'auto' : 'always',
      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
    });
  };

  return (
    <div className={styles.root}>
      {days.map((day, index) => {
        const label = dayLabel(day.date, today, locale, words);
        const complete = !(partialLast && index === days.length - 1);
        const total = totals && complete ? dayTotal(day.items) : null;
        return (
          <section key={day.date} className={styles.day} aria-label={label}>
            <h3 className={styles.date}>
              <time dateTime={day.date}>{label}</time>
              {total !== null && <span className={styles.total}>{total}</span>}
            </h3>
            <ul className={styles.list}>
              {day.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  columns={columns}
                  selected={transaction.id === selectedId}
                  {...(onOpen ? { onOpen } : {})}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
