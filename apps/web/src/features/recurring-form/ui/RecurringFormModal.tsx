import {
  MONTH_END_POLICIES,
  RECURRENCE_FREQS,
  parseUserAmount,
  todayIn,
  toMoney,
  type RecurringRuleResponse,
} from '@moneymap/shared';
import { useState } from 'react';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { weekdayName } from '@/entities/recurring';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import { useCreateRecurringRule, useUpdateRecurringRule } from '../api/use-recurring-mutations.ts';
import styles from './RecurringFormModal.module.scss';

interface RecurringFormModalProps {
  rule?: RecurringRuleResponse;
  onClose: () => void;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function RecurringFormModal({ rule, onClose }: RecurringFormModalProps) {
  const { t, locale } = useT();
  const { user } = useMe();
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule();

  const isEdit = rule !== undefined;
  const open = (accounts.data ?? []).filter((a) => !a.isArchived);

  const [name, setName] = useState(rule?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(rule?.kind ?? 'expense');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [amount, setAmount] = useState(rule ? toMoney(rule.amount) : '');
  const [freq, setFreq] = useState(rule?.freq ?? 'monthly');
  const [interval, setInterval] = useState(String(rule?.interval ?? 1));
  const [startOn, setStartOn] = useState(rule?.startOn ?? todayIn(user?.timezone ?? 'UTC'));
  const [endOn, setEndOn] = useState(rule?.endOn ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ? String(rule.dayOfMonth) : '');
  const [weekday, setWeekday] = useState(
    rule?.weekday !== null && rule?.weekday !== undefined ? String(rule.weekday) : '',
  );
  const [monthEndPolicy, setMonthEndPolicy] = useState(rule?.monthEndPolicy ?? 'clamp');
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Счёт по умолчанию вычисляется, а не кладётся в состояние.
   *
   * В первый рендер список счетов ещё не пришёл, и состояние осталось бы
   * пустым навсегда — при том что <select> уже показывает первый счёт.
   * Форма выглядела бы заполненной и уезжала на сервер с пустым accountId.
   */
  const selectedAccountId = accountId || open[0]?.id || '';

  const categoryOptions = (categories.data ?? []).filter((c) => c.kind === kind);
  const needsDay = freq === 'monthly' || freq === 'yearly';
  const needsWeekday = freq === 'weekly';
  // О коротком месяце спрашиваем только тогда, когда он случится: для
  // 15-го числа этот выбор не значит ничего.
  const needsPolicy = needsDay && Number(dayOfMonth || startOn.slice(8, 10)) > 28;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    let parsed: string;
    try {
      parsed = parseUserAmount(amount);
    } catch {
      setError('validation.money.format');
      return;
    }

    const schedule = {
      freq,
      interval: Number(interval) || 1,
      monthEndPolicy,
      dayOfMonth: needsDay && dayOfMonth ? Number(dayOfMonth) : null,
      weekday: needsWeekday && weekday !== '' ? Number(weekday) : null,
      endOn: endOn === '' ? null : endOn,
      autoPost,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({
          id: rule.id,
          input: {
            name: name.trim(),
            amount: parsed,
            categoryId: categoryId === '' ? null : categoryId,
            ...schedule,
          },
        });
        toast.success(t('recurring.updated'));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          accountId: selectedAccountId,
          categoryId: categoryId === '' ? null : categoryId,
          kind,
          amount: parsed,
          startOn,
          ...schedule,
        });
        toast.success(t('recurring.created'));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'errors.requestFailed');
    }
  };

  return (
    <Modal
      open
      title={isEdit ? t('recurring.editTitle') : t('recurring.createTitle')}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && <Alert>{t(error)}</Alert>}

        {/* Вид, счёт и дата начала после создания не меняются: все три уже
            отражены в созданных операциях. */}
        {!isEdit && (
          <div className={styles.modes} role="group">
            {(['expense', 'income'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={kind === value ? styles.modeActive : styles.mode}
                onClick={() => {
                  setKind(value);
                  setCategoryId('');
                }}
                aria-pressed={kind === value}
              >
                {t(`transactions.${value}`)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.fields}>
          <Field
            label={t('recurring.name')}
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />

          <Select
            label={t('transactions.account')}
            value={selectedAccountId}
            disabled={isEdit}
            onChange={(e) => setAccountId(e.currentTarget.value)}
          >
            {open.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currencyCode}
              </option>
            ))}
          </Select>

          <Select
            label={t('transactions.category')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.currentTarget.value)}
          >
            <option value="">{t('transactions.categoryNone')}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentId ? `— ${category.name}` : category.name}
              </option>
            ))}
          </Select>

          <Field
            label={t('transactions.amount')}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
          />

          <div className={styles.row}>
            <Select
              label={t('recurring.freq')}
              value={freq}
              onChange={(e) => setFreq(e.currentTarget.value as typeof freq)}
            >
              {RECURRENCE_FREQS.map((value) => (
                <option key={value} value={value}>
                  {t(`recurring.every.${value}`)}
                </option>
              ))}
            </Select>

            <Field
              label={t('recurring.interval')}
              type="number"
              min={1}
              max={366}
              hint={t('recurring.intervalHint')}
              value={interval}
              onChange={(e) => setInterval(e.currentTarget.value)}
            />
          </div>

          {needsWeekday && (
            <Select
              label={t('recurring.weekday')}
              value={weekday}
              onChange={(e) => setWeekday(e.currentTarget.value)}
            >
              <option value="">{t('recurring.fromStart')}</option>
              {WEEKDAYS.map((value) => (
                <option key={value} value={value}>
                  {weekdayName(value, locale)}
                </option>
              ))}
            </Select>
          )}

          {needsDay && (
            <Field
              label={t('recurring.dayOfMonth')}
              type="number"
              min={1}
              max={31}
              hint={t('recurring.fromStart')}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.currentTarget.value)}
            />
          )}

          {needsPolicy && (
            <Select
              label={t('recurring.monthEnd')}
              hint={t('recurring.monthEndHint')}
              value={monthEndPolicy}
              onChange={(e) => setMonthEndPolicy(e.currentTarget.value as typeof monthEndPolicy)}
            >
              {MONTH_END_POLICIES.map((value) => (
                <option key={value} value={value}>
                  {t(`recurring.policy.${value}`)}
                </option>
              ))}
            </Select>
          )}

          <div className={styles.row}>
            <Field
              label={t('recurring.startOn')}
              type="date"
              value={startOn}
              disabled={isEdit}
              onChange={(e) => setStartOn(e.currentTarget.value)}
            />
            <Field
              label={t('recurring.endOn')}
              type="date"
              hint={t('recurring.endOnHint')}
              value={endOn}
              onChange={(e) => setEndOn(e.currentTarget.value)}
            />
          </div>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={!autoPost}
              onChange={(e) => setAutoPost(!e.currentTarget.checked)}
            />
            <span>
              {t('recurring.askFirst')}
              <span className={styles.hint}>{t('recurring.askFirstHint')}</span>
            </span>
          </label>
        </div>

        <Button type="submit" block loading={create.isPending || update.isPending}>
          {isEdit ? t('recurring.save') : t('recurring.submit')}
        </Button>
      </form>
    </Modal>
  );
}
