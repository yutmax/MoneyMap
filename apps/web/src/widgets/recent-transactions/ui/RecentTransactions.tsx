import { Link } from 'react-router';
import { TransactionRow, useTransactions } from '@/entities/transaction';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import styles from './RecentTransactions.module.scss';

/** Сколько строк показывать на главной: дальше начинается отдельная страница. */
const LIMIT = 5;

/**
 * Последние операции на главной.
 *
 * Пять строк, а не вся лента: главная отвечает на вопрос «что происходит»,
 * а «что было в марте» — это уже поиск, и для него есть своя страница
 * с фильтрами. Отсюда и ссылка «показать все» вместо бесконечной прокрутки.
 */
export function RecentTransactions() {
  const { t } = useT();
  const transactions = useTransactions({});

  const list = (transactions.data?.pages[0]?.transactions ?? []).slice(0, LIMIT);

  return (
    <section className={styles.root} aria-labelledby="recent-title">
      <header className={styles.header}>
        <h2 className={styles.title} id="recent-title">
          {t('dashboard.recent')}
        </h2>
        <Link to={ROUTES.transactions} className={styles.all}>
          {t('dashboard.showAll')}
        </Link>
      </header>

      {transactions.isPending ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <p className={styles.empty}>{t('transactions.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
    </section>
  );
}
