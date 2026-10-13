import {
  formatMoney,
  isNegative,
  parseUserAmount,
  type BudgetRow,
  type BudgetStatus,
} from '@moneymap/shared';
import { useState } from 'react';
import { useAccounts } from '@/entities/account';
import { categoryName, useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Button, Field, Select, Spinner, toast } from '@/shared/ui';
import { useBudgets } from '../api/budget-queries.ts';
import { useCreateBudget, useDeleteBudget, useUpdateBudget } from '../api/use-budget-mutations.ts';
import styles from './BudgetBlock.module.scss';

/** Как показывать деньги — одинаково во всём блоке. */
type Money = (amount: string) => string;

/**
 * Бюджеты (§8.10).
 *
 * Живут на странице отчётов, а не отдельным разделом: лимит читается рядом
 * с тем, что по нему потрачено, и разносить их по двум экранам значило бы
 * заставлять человека держать числа в голове между переходами.
 *
 * Каждый лимит — отдельная карточка со своей правкой и своим удалением.
 * Раньше кнопка «Изменить» открывала поля сразу у всех, а удаление надо было
 * изображать нулём в поле суммы: для трёх строк это читалось, дальше — нет.
 */
export function BudgetBlock() {
  const { t, locale } = useT();
  const budgets = useBudgets();
  const categories = useCategories();
  const accounts = useAccounts();
  const currencies = useCurrencies();

  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();

  /** Открыт ровно один редактор: либо правка строки, либо добавление. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const base = budgets.data?.baseCurrency ?? '';
  const currency = currencies.data?.find((c) => c.code === base);
  const money: Money = (amount) =>
    formatMoney(amount, {
      currency: base,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });

  const rows = budgets.data?.budgets ?? [];
  const busy = create.isPending || update.isPending || remove.isPending;

  const takenCategories = new Set(
    rows.flatMap((row) => (row.target.kind === 'category' ? [row.target.categoryId] : [])),
  );
  const takenAccounts = new Set(
    rows.flatMap((row) => (row.target.kind === 'account' ? [row.target.accountId] : [])),
  );

  const freeCategories = (categories.data ?? []).filter(
    (c) => c.kind === 'expense' && !takenCategories.has(c.id),
  );
  // Архивный счёт из списка убран: заводить лимит на то, чем уже не
  // пользуются, незачем.
  const freeAccounts = (accounts.data ?? []).filter(
    (a) => !a.isArchived && !takenAccounts.has(a.id),
  );

  const nameOf = (target: BudgetRow['target']) =>
    target.kind === 'category' ? categoryName(t, target.categoryKey) : target.accountName;

  if (budgets.isPending) return <Spinner />;

  return (
    <div className={styles.root}>
      {/* Валюта названа один раз на весь блок: она одна для всех лимитов,
          и повторять её у каждой подписи — шум. */}
      <p className={styles.note}>
        {t('budgets.inCurrency', { currency: currency?.symbol ?? base })}
      </p>

      {rows.length === 0 ? (
        <p className={styles.empty}>{t('budgets.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.card}>
              {editingId === row.id ? (
                <LimitForm
                  title={nameOf(row.target)}
                  initial={row.amount}
                  currency={currency?.symbol ?? base}
                  busy={update.isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(amount) =>
                    update.mutate(
                      { id: row.id, input: { amount } },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          toast.success(t('budgets.saved'));
                        },
                        onError: (error) => toast.error(t(error.message)),
                      },
                    )
                  }
                />
              ) : (
                <BudgetCardView
                  row={row}
                  name={nameOf(row.target)}
                  money={money}
                  t={t}
                  disabled={busy}
                  onEdit={() => {
                    setAdding(false);
                    setEditingId(row.id);
                  }}
                  onDelete={() =>
                    remove.mutate(row.id, {
                      onSuccess: () => toast.success(t('budgets.deleted')),
                      onError: (error) => toast.error(t(error.message)),
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddBudgetForm
          currency={currency?.symbol ?? base}
          categories={freeCategories.map((c) => ({ id: c.id, name: categoryName(t, c.key) }))}
          accounts={freeAccounts.map((a) => ({ id: a.id, name: a.name }))}
          busy={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: () => {
                setAdding(false);
                toast.success(t('budgets.created'));
              },
              onError: (error) => toast.error(t(error.message)),
            })
          }
        />
      ) : (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
          >
            {t('budgets.add')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── карточка лимита ───────────────────────────── */

interface BudgetCardViewProps {
  row: BudgetRow;
  name: string;
  money: Money;
  t: (key: string, params?: Record<string, string | number>) => string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function BudgetCardView({ row, name, money, t, disabled, onEdit, onDelete }: BudgetCardViewProps) {
  // Доля приходит долей, а не процентом: округление до целого — дело показа.
  const percent = Math.round(row.share * 100);

  return (
    <>
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        {/* Лимит на счёт считает все расходы по нему, и спутать его с
            одноимённой категорией было бы легко — отсюда подпись. */}
        {row.target.kind === 'account' && (
          <span className={styles.badge}>{t('budgets.accountBadge')}</span>
        )}
        <span className={styles.cardActions}>
          <Button variant="secondary" size="small" disabled={disabled} onClick={onEdit}>
            {t('budgets.edit')}
          </Button>
          <Button variant="danger" size="small" disabled={disabled} onClick={onDelete}>
            {t('budgets.delete')}
          </Button>
        </span>
      </div>

      <div className={styles.numbers}>
        <span className={styles.progress}>
          {t('budgets.progress', { spent: money(row.spent), limit: money(row.limit) })}
        </span>
        <span className={cx(styles.percent, styles[row.status])}>
          {t('budgets.percent', { percent })}
        </span>
      </div>

      <Meter share={row.share} status={row.status} />

      <div className={styles.footer}>
        {/* Состояние подписано словом, а не только цветом: по цвету одному
            «на исходе» и «перерасход» различит не каждый. */}
        <span className={cx(styles.status, styles[row.status])}>
          {row.status === 'over'
            ? t('budgets.over', { amount: money(abs(row.remaining)) })
            : t('budgets.left', { amount: money(row.remaining) })}
        </span>
        <span className={styles.perDay}>{t('budgets.perDay', { amount: money(row.perDay) })}</span>
      </div>

      {row.carried !== '0' && (
        <p className={styles.carried}>{t('budgets.carried', { amount: money(row.carried) })}</p>
      )}
    </>
  );
}

/* ───────────────────────────── правка суммы ─────────────────────────────── */

interface LimitFormProps {
  title: string;
  initial: string;
  currency: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (amount: string) => void;
}

function LimitForm({ title, initial, currency, busy, onCancel, onSubmit }: LimitFormProps) {
  const { t } = useT();
  const [value, setValue] = useState(initial);

  const submit = () => {
    let amount: string;
    try {
      amount = parseUserAmount(value);
    } catch {
      toast.error(t('validation.money.format'));
      return;
    }
    onSubmit(amount);
  };

  return (
    <>
      <div className={styles.head}>
        <span className={styles.name}>{title}</span>
      </div>

      <Field
        label={t('budgets.limitIn', { currency })}
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />

      <div className={styles.formActions}>
        <Button size="small" loading={busy} onClick={submit}>
          {t('budgets.save')}
        </Button>
        <Button variant="secondary" size="small" disabled={busy} onClick={onCancel}>
          {t('budgets.cancel')}
        </Button>
      </div>
    </>
  );
}

/* ─────────────────────────── добавление лимита ──────────────────────────── */

interface Option {
  id: string;
  name: string;
}

interface AddBudgetFormProps {
  currency: string;
  categories: Option[];
  accounts: Option[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { categoryId?: string; accountId?: string; amount: string }) => void;
}

function AddBudgetForm({
  currency,
  categories,
  accounts,
  busy,
  onCancel,
  onSubmit,
}: AddBudgetFormProps) {
  const { t } = useT();
  const [kind, setKind] = useState<'category' | 'account'>('category');
  const [targetId, setTargetId] = useState('');
  const [value, setValue] = useState('');

  const options = kind === 'category' ? categories : accounts;
  const emptyHint = kind === 'category' ? 'budgets.noCategoriesLeft' : 'budgets.noAccountsLeft';

  const submit = () => {
    if (targetId === '') return;

    let amount: string;
    try {
      amount = parseUserAmount(value);
    } catch {
      toast.error(t('validation.money.format'));
      return;
    }

    onSubmit(
      kind === 'category' ? { categoryId: targetId, amount } : { accountId: targetId, amount },
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.name}>{t('budgets.addTitle')}</span>
      </div>

      <Select
        label={t('budgets.targetKind')}
        value={kind}
        onChange={(e) => {
          setKind(e.currentTarget.value as 'category' | 'account');
          // Цель сбрасывается вместе с видом: id категории в списке счетов
          // не значит ничего.
          setTargetId('');
        }}
      >
        <option value="category">{t('budgets.byCategory')}</option>
        <option value="account">{t('budgets.byAccount')}</option>
      </Select>

      {options.length === 0 ? (
        <p className={styles.empty}>{t(emptyHint)}</p>
      ) : (
        <Select
          label={kind === 'category' ? t('budgets.byCategory') : t('budgets.byAccount')}
          value={targetId}
          onChange={(e) => setTargetId(e.currentTarget.value)}
        >
          <option value="">
            {kind === 'category' ? t('budgets.chooseCategory') : t('budgets.chooseAccount')}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      )}

      <Field
        label={t('budgets.limitIn', { currency })}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />

      <div className={styles.formActions}>
        <Button size="small" loading={busy} disabled={targetId === ''} onClick={submit}>
          {t('budgets.add')}
        </Button>
        <Button variant="secondary" size="small" disabled={busy} onClick={onCancel}>
          {t('budgets.cancel')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Цвет заливки по состоянию — явной картой, а не склейкой имени класса.
 *
 * Склейка здесь и не работала: CSS-модули собраны с localsConvention
 * camelCaseOnly, и `.fillOk` попадает в JS только под этим именем, тогда как
 * `styles['fill_ok']` всегда был undefined — полоса оставалась пустой.
 * Заметить это по типам было нельзя: модуль описан индексной сигнатурой, и
 * любое обращение к нему и так `string | undefined`. Карта хотя бы требует
 * пары на каждое состояние и ломается, если состояний станет больше.
 */
const FILL_BY_STATUS: Record<BudgetStatus, string | undefined> = {
  ok: styles.fillOk,
  warning: styles.fillWarning,
  over: styles.fillOver,
};

/** Полоса «потрачено от лимита». Переполнение обрезается по ширине дорожки. */
function Meter({ share, status }: { share: number; status: BudgetStatus }) {
  return (
    <span className={styles.track}>
      <span
        className={cx(styles.fill, FILL_BY_STATUS[status])}
        style={{ inlineSize: `${Math.min(Math.max(share, 0), 1) * 100}%` }}
      />
    </span>
  );
}

function abs(value: string): string {
  return isNegative(value) ? value.slice(1) : value;
}
