import { todayIn, type TransactionResponse } from '@moneymap/shared';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { dayLabel } from '../lib/day-label.ts';
import { TransactionRow } from './TransactionRow.tsx';
import styles from './TransactionList.module.scss';

interface TransactionListProps {
  transactions: TransactionResponse[];
  onOpen?: (transaction: TransactionResponse) => void;
}

/**
 * Лента операций, сгруппированная по дням.
 *
 * Дата ушла из строки в заголовок дня: семь раз подряд «22 нояб. 2026 г.»
 * посреди строк — не информация, а рябь, и из-за неё суммы не стояли
 * столбцом. Порядок не меняется: сервер уже отдаёт ленту от новых к старым,
 * здесь она только режется на дни.
 */
export function TransactionList({ transactions, onOpen }: TransactionListProps) {
  const { t, locale } = useT();
  const { user } = useMe();
  const today = todayIn(user?.timezone ?? 'UTC');
  const words = { today: t('transactions.today'), yesterday: t('transactions.yesterday') };

  const days: Array<{ date: string; items: TransactionResponse[] }> = [];
  for (const transaction of transactions) {
    const last = days.at(-1);
    if (last?.date === transaction.occurredOn) last.items.push(transaction);
    else days.push({ date: transaction.occurredOn, items: [transaction] });
  }

  return (
    <div className={styles.root}>
      {days.map((day) => {
        const label = dayLabel(day.date, today, locale, words);
        return (
          <section key={day.date} className={styles.day} aria-label={label}>
            <h3 className={styles.date}>
              <time dateTime={day.date}>{label}</time>
            </h3>
            <ul className={styles.list}>
              {day.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
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
