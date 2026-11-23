import { shiftDays, todayIn, TRANSACTION_KINDS, type TransactionResponse } from '@moneymap/shared';
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAccounts } from '@/entities/account';
import { categoryName, useCategories } from '@/entities/category';
import { TransactionList, useTransactions, type TransactionFilters } from '@/entities/transaction';
import { useMe } from '@/entities/user';
import { ImportModal } from '@/features/import-csv';
import { TransactionFormModal } from '@/features/transaction-form';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Alert, Button, Icon, SectionTabs } from '@/shared/ui';
import { FilterPill } from './FilterPill.tsx';
import { TransactionDetails } from './TransactionDetails.tsx';
import styles from './TransactionsPage.module.scss';

type FormState = null | 'new' | TransactionResponse;

/** Готовые периоды. Пустая строка — «за всё время», `custom` — две даты руками. */
const PERIODS = ['thisMonth', 'lastMonth', 'last3', 'thisYear', 'custom'] as const;
type Period = '' | (typeof PERIODS)[number];

const PERIOD_LABEL: Record<(typeof PERIODS)[number], string> = {
  thisMonth: 'transactions.periodThisMonth',
  lastMonth: 'transactions.periodLastMonth',
  last3: 'transactions.periodLast3',
  thisYear: 'transactions.periodThisYear',
  custom: 'transactions.periodCustom',
};

/** Первое число месяца, сдвинутого на `offset` от месяца даты `today`. */
function monthStart(today: string, offset: number): string {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

/** Границы готового периода. Для «своего» даты задаёт человек. */
function periodRange(period: Period, today: string): { from?: string; to?: string } {
  switch (period) {
    case 'thisMonth':
      return { from: monthStart(today, 0), to: today };
    case 'lastMonth':
      return { from: monthStart(today, -1), to: shiftDays(monthStart(today, 0), -1) };
    case 'last3':
      return { from: monthStart(today, -2), to: today };
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return {};
  }
}

/** Пауза перед поиском: запрос уходит, когда человек перестал печатать. */
const SEARCH_DELAY = 300;

/**
 * С этой ширины подробности операции открываются панелью рядом с лентой,
 * уже — окном поверх: для второй колонки на телефоне нет места. Значение
 * совпадает с брейкпоинтом lg в стилях.
 */
const WIDE = '(width >= 64rem)';

/**
 * Операции: вкладки и действия в одной строке, под ними — поиск и фильтры
 * таблетками, ниже лента по дням.
 *
 * Раньше фильтр был коробкой из пяти полей с подписями, где почти всегда
 * стояло «Все», а дата вводилась руками в системном «дд.мм.гггг». Теперь
 * незаданный фильтр — это короткая таблетка, заданный — подсвеченная с
 * крестиком, а период выбирается готовыми вариантами; две даты появляются,
 * только если выбран «свой период».
 */
export function TransactionsPage() {
  const { t } = useT();
  const { user } = useMe();
  const today = todayIn(user?.timezone ?? 'UTC');
  const searchId = useId();

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  // Запрос может прийти из поиска в шапке — тогда он уже в адресе.
  const [params] = useSearchParams();
  const fromUrl = params.get('search') ?? '';
  const [searchText, setSearchText] = useState(fromUrl);
  const [search, setSearch] = useState(fromUrl);
  const [form, setForm] = useState<FormState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Повторный поиск из шапки, когда страница уже открыта: адрес меняется,
  // а компонент остаётся тем же, и начальное значение второй раз не читается.
  useEffect(() => {
    setSearchText(fromUrl);
  }, [fromUrl]);
  const [importing, setImporting] = useState(false);

  // Поиск с задержкой: без неё каждая буква — отдельный запрос и мигание
  // ленты, хотя нужен только результат по последней.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [searchText]);

  const range =
    period === 'custom'
      ? {
          ...(custom.from ? { from: custom.from } : {}),
          ...(custom.to ? { to: custom.to } : {}),
        }
      : periodRange(period, today);

  const filters: TransactionFilters = {
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(kind ? { kind: kind as TransactionFilters['kind'] } : {}),
    ...(search ? { search } : {}),
    ...range,
  };

  const accounts = useAccounts();
  const categories = useCategories();
  const query = useTransactions(filters);

  const rows = query.data?.pages.flatMap((page) => page.transactions) ?? [];
  // Выбранная операция ищется в загруженной ленте, а не хранится копией:
  // после правки в окне панель показывает уже новые данные, а удалённая
  // операция закрывает панель сама.
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const open = (transaction: TransactionResponse) => {
    if (window.matchMedia(WIDE).matches) setSelectedId(transaction.id);
    else setForm(transaction);
  };
  const filtered = Object.keys(filters).length > 0 || searchText !== '';

  const resetAll = () => {
    setAccountId('');
    setCategoryId('');
    setKind('');
    setPeriod('');
    setCustom({ from: '', to: '' });
    setSearchText('');
    setSearch('');
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <SectionTabs
          tabs={[
            { to: ROUTES.transactions, label: t('nav.transactions') },
            { to: ROUTES.recurring, label: t('nav.recurring') },
          ]}
        />

        <div className={styles.headerActions}>
          {/* Импорт — значком: им пользуются раз в месяц, а подпись рядом с
              «+ Операция» спорила с ней за внимание. Название — в подсказке
              и для скринридера. */}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setImporting(true)}
            aria-label={t('import.open')}
            title={t('import.open')}
          >
            <Icon name="file-up" className={styles.iconButtonGlyph} />
          </button>
        </div>
      </header>

      <section className={styles.filters} aria-label={t('transactions.filters')}>
        <label className={styles.search} htmlFor={searchId}>
          <Icon name="search" className={styles.searchIcon} />
          <span className="visually-hidden">{t('transactions.note')}</span>
          <input
            id={searchId}
            type="search"
            className={styles.searchInput}
            placeholder={t('transactions.searchPlaceholder')}
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
          />
        </label>

        <FilterPill label={t('transactions.account')} value={accountId} onChange={setAccountId}>
          <option value="">{t('transactions.allAccounts')}</option>
          {(accounts.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </FilterPill>

        <FilterPill label={t('transactions.category')} value={categoryId} onChange={setCategoryId}>
          <option value="">{t('transactions.allCategories')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(t, category.key)}
            </option>
          ))}
        </FilterPill>

        <FilterPill label={t('transactions.kindFilter')} value={kind} onChange={setKind}>
          <option value="">{t('transactions.anyKind')}</option>
          {TRANSACTION_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`transactions.${value}`)}
            </option>
          ))}
        </FilterPill>

        <FilterPill
          label={t('transactions.periodLabel')}
          value={period}
          onChange={(value) => setPeriod(value as Period)}
          icon="calendar"
        >
          <option value="">{t('transactions.periodAll')}</option>
          {PERIODS.map((value) => (
            <option key={value} value={value}>
              {t(PERIOD_LABEL[value])}
            </option>
          ))}
        </FilterPill>

        {period === 'custom' && (
          <span className={styles.range}>
            <label className={styles.dateLabel}>
              <span>{t('transactions.dateFrom')}</span>
              <input
                type="date"
                className={styles.date}
                value={custom.from}
                max={custom.to || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.currentTarget.value }))}
              />
            </label>
            <label className={styles.dateLabel}>
              <span>{t('transactions.dateTo')}</span>
              <input
                type="date"
                className={styles.date}
                value={custom.to}
                min={custom.from || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.currentTarget.value }))}
              />
            </label>
          </span>
        )}

        {filtered && (
          <button type="button" className={styles.reset} onClick={resetAll}>
            {t('transactions.filterReset')}
          </button>
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
        <div className={cx(styles.board, selected && styles.split)}>
          <div className={styles.listCard}>
            {/* Шапка колонок — только там, где строки раскладываются в таблицу. */}
            <div className={styles.columnsHead} aria-hidden="true">
              <span>{t('transactions.category')}</span>
              <span>{t('transactions.account')}</span>
              <span>{t('transactions.note')}</span>
              <span className={styles.columnsAmount}>{t('transactions.amount')}</span>
            </div>

            <TransactionList
              transactions={rows}
              onOpen={open}
              totals
              partialLast={query.hasNextPage}
              columns
              selectedId={selected?.id ?? null}
            />

            {query.hasNextPage && (
              <div className={styles.more}>
                <Button
                  variant="secondary"
                  onClick={() => void query.fetchNextPage()}
                  loading={query.isFetchingNextPage}
                >
                  {t('transactions.loadMore')}
                </Button>
              </div>
            )}
          </div>

          {selected && (
            <div className={styles.details}>
              <TransactionDetails
                transaction={selected}
                onEdit={() => setForm(selected)}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
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
