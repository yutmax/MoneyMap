import { TRANSACTION_KINDS, type TransactionResponse } from '@moneymap/shared';
import { useState } from 'react';
import { useAccounts } from '@/entities/account';
import { categoryName, useCategories } from '@/entities/category';
import { TransactionList, useTransactions, type TransactionFilters } from '@/entities/transaction';
import { ImportModal } from '@/features/import-csv';
import { TransactionFormModal } from '@/features/transaction-form';
import { useT } from '@/shared/i18n';
import { ROUTES } from '@/shared/config';
import { Alert, Button, Field, SectionTabs, Select } from '@/shared/ui';
import styles from './TransactionsPage.module.scss';

type FormState = null | 'new' | TransactionResponse;

const EMPTY: TransactionFilters = {};

export function TransactionsPage() {
  const { t } = useT();
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY);
  const [form, setForm] = useState<FormState>(null);
  const [importing, setImporting] = useState(false);

  const accounts = useAccounts();
  const categories = useCategories();
  const query = useTransactions(filters);

  const rows = query.data?.pages.flatMap((page) => page.transactions) ?? [];
  const filtered = Object.values(filters).some((v) => v !== undefined && v !== '');

  const patch = (next: Partial<TransactionFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.subtitle}>{t('transactions.subtitle')}</p>
        </div>

        <SectionTabs
          tabs={[
            { to: ROUTES.transactions, label: t('nav.transactions') },
            { to: ROUTES.recurring, label: t('nav.recurring') },
          ]}
        />

        <div className={styles.headerActions}>
          <Button variant="secondary" size="small" onClick={() => setImporting(true)}>
            {t('import.open')}
          </Button>
          <Button size="small" onClick={() => setForm('new')}>
            {t('transactions.create')}
          </Button>
        </div>
      </header>

      <section className={styles.filters} aria-label={t('transactions.filters')}>
        <Select
          label={t('transactions.account')}
          value={filters.accountId ?? ''}
          onChange={(e) => patch({ accountId: e.currentTarget.value || undefined })}
        >
          <option value="">{t('transactions.filterAll')}</option>
          {(accounts.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>

        <Select
          label={t('transactions.category')}
          value={filters.categoryId ?? ''}
          onChange={(e) => patch({ categoryId: e.currentTarget.value || undefined })}
        >
          <option value="">{t('transactions.filterAll')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(t, category.key)}
            </option>
          ))}
        </Select>

        <Select
          label={t('transactions.kindFilter')}
          value={filters.kind ?? ''}
          onChange={(e) =>
            patch({ kind: (e.currentTarget.value || undefined) as TransactionFilters['kind'] })
          }
        >
          <option value="">{t('transactions.filterAll')}</option>
          {TRANSACTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`transactions.${kind}`)}
            </option>
          ))}
        </Select>

        <Field
          label={t('transactions.date')}
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => patch({ from: e.currentTarget.value || undefined })}
        />

        <Field
          label={t('transactions.note')}
          placeholder={t('transactions.searchPlaceholder')}
          value={filters.search ?? ''}
          onChange={(e) => patch({ search: e.currentTarget.value || undefined })}
        />

        {filtered && (
          <Button variant="secondary" size="small" onClick={() => setFilters(EMPTY)}>
            {t('transactions.filterReset')}
          </Button>
        )}
      </section>

      {query.isError && <Alert>{t('transactions.loadFailed')}</Alert>}

      {query.isPending ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          {filtered ? t('transactions.emptyFiltered') : t('transactions.empty')}
        </p>
      ) : (
        <>
          {/* Нажатие на строку открывает операцию: там и правка, и удаление. */}
          <TransactionList transactions={rows} onOpen={setForm} />

          {query.hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => void query.fetchNextPage()}
              loading={query.isFetchingNextPage}
            >
              {t('transactions.loadMore')}
            </Button>
          )}
        </>
      )}

      {form !== null && (
        <TransactionFormModal
          {...(form === 'new' ? {} : { transaction: form })}
          onClose={() => setForm(null)}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}
