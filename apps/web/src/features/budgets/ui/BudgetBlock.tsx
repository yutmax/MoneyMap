import { formatMoney, isNegative, parseUserAmount, type BudgetRow } from '@moneymap/shared';
import { useState } from 'react';
import { useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Button, Field, Select, Spinner, toast } from '@/shared/ui';
import { useBudgets } from '../api/budget-queries.ts';
import { useSetBudgets } from '../api/use-budget-mutations.ts';
import styles from './BudgetBlock.module.scss';

/**
 * Бюджеты по категориям (§8.10).
 *
 * Живут на странице отчётов, а не отдельным разделом: лимит читается рядом
 * с тем, что по нему потрачено, и разносить их по двум экранам значило бы
 * заставлять человека держать числа в голове между переходами.
 */
export function BudgetBlock() {
  const { t, locale } = useT();
  const budgets = useBudgets();
  const categories = useCategories();
  const currencies = useCurrencies();
  const save = useSetBudgets();

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pick, setPick] = useState('');

  const base = budgets.data?.baseCurrency ?? '';
  const currency = currencies.data?.find((c) => c.code === base);
  const money = (amount: string) =>
    formatMoney(amount, {
      currency: base,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });

  const rows = budgets.data?.budgets ?? [];
  const spent = new Set(rows.map((row) => row.categoryId));
  const available = (categories.data ?? []).filter((c) => c.kind === 'expense' && !spent.has(c.id));

  const startEditing = () => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.categoryId, row.amount])));
    setEditing(true);
  };

  const submit = () => {
    const payload: { categoryId: string; amount: string; rollover?: boolean }[] = [];
    for (const [categoryId, raw] of Object.entries(drafts)) {
      let amount: string;
      try {
        // Пустое поле — это «лимита нет», а не ошибка ввода.
        amount = raw.trim() === '' ? '0' : parseUserAmount(raw);
      } catch {
        toast.error(t('validation.money.format'));
        return;
      }
      const existing = rows.find((row) => row.categoryId === categoryId);
      payload.push({ categoryId, amount, rollover: existing?.rollover ?? false });
    }

    save.mutate(
      { budgets: payload },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(t('budgets.saved'));
        },
        onError: (error) => toast.error(t(error.message)),
      },
    );
  };

  if (budgets.isPending) return <Spinner />;

  return (
    <div className={styles.root}>
      {rows.length === 0 && !editing ? (
        <p className={styles.empty}>{t('budgets.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.categoryId} className={styles.row}>
              <span className={styles.name}>{row.categoryName}</span>

              {editing ? (
                <Field
                  label={t('budgets.limit')}
                  inputMode="decimal"
                  value={drafts[row.categoryId] ?? ''}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setDrafts((prev) => ({ ...prev, [row.categoryId]: value }));
                  }}
                />
              ) : (
                <>
                  <span className={styles.numbers}>
                    {t('budgets.progress', {
                      spent: money(row.spent),
                      limit: money(row.limit),
                    })}
                  </span>

                  {/* Состояние подписано словом, а не только цветом: по цвету
                      одному «на исходе» и «перерасход» различит не каждый. */}
                  <span className={cx(styles.status, styles[row.status])}>
                    {row.status === 'over'
                      ? t('budgets.over', { amount: money(abs(row.remaining)) })
                      : t('budgets.left', { amount: money(row.remaining) })}
                  </span>

                  <Meter share={row.share} status={row.status} />

                  {row.carried !== '0' && (
                    <span className={styles.carried}>
                      {t('budgets.carried', { amount: money(row.carried) })}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && available.length > 0 && (
        <Select
          label={t('budgets.add')}
          value={pick}
          onChange={(e) => {
            const id = e.currentTarget.value;
            if (!id) return;
            setDrafts((prev) => ({ ...prev, [id]: '' }));
            setPick('');
          }}
        >
          <option value="">{t('budgets.choose')}</option>
          {available.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      )}

      <div className={styles.actions}>
        {editing ? (
          <>
            <Button size="small" loading={save.isPending} onClick={submit}>
              {t('budgets.save')}
            </Button>
            <Button variant="secondary" size="small" onClick={() => setEditing(false)}>
              {t('budgets.cancel')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="small" onClick={startEditing}>
            {rows.length === 0 ? t('budgets.create') : t('budgets.edit')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Полоса «потрачено от лимита». Переполнение обрезается по ширине дорожки. */
function Meter({ share, status }: { share: number; status: BudgetRow['status'] }) {
  return (
    <span className={styles.track}>
      <span
        className={cx(styles.fill, styles[`fill_${status}`])}
        style={{ inlineSize: `${Math.min(Math.max(share, 0), 1) * 100}%` }}
      />
    </span>
  );
}

function abs(value: string): string {
  return isNegative(value) ? value.slice(1) : value;
}
