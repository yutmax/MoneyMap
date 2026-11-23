import type { TransactionResponse } from '@moneymap/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { TransactionList, useTransactions } from '@/entities/transaction';
import { TransactionFormModal } from '@/features/transaction-form';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import styles from './RecentTransactions.module.scss';

/** Сколько строк показывать на главной: дальше начинается отдельная страница. */
const LIMIT = 6;

/**
 * Последние операции на главной.
 *
 * Шесть строк, а не вся лента: главная отвечает на вопрос «что происходит»,
 * а «что было в марте» — это уже поиск, и для него есть своя страница
 * с фильтрами. Строку можно открыть прямо отсюда — поправить сумму только
 * что внесённой покупки не должно требовать перехода.
 */
export function RecentTransactions() {
  const { t } = useT();
  const transactions = useTransactions({});
  const [open, setOpen] = useState<TransactionResponse | null>(null);

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
        <div className={styles.skeleton} aria-busy="true" />
      ) : list.length === 0 ? (
        <p className={styles.empty}>{t('transactions.empty')}</p>
      ) : (
        <TransactionList transactions={list} onOpen={setOpen} />
      )}

      {open && <TransactionFormModal transaction={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
