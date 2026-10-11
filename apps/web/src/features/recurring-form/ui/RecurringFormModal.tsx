import {
  MONTH_END_POLICIES,
  parseUserAmount,
  todayIn,
  toMoney,
  type RecurringRuleResponse,
} from '@moneymap/shared';
import { useState } from 'react';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { scheduleText } from '@/entities/recurring';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import { useCreateRecurringRule, useUpdateRecurringRule } from '../api/use-recurring-mutations.ts';
import styles from './RecurringFormModal.module.scss';

interface RecurringFormModalProps {
  rule?: RecurringRuleResponse;
  onClose: () => void;
}

/**
 * Готовые периодичности вместо пары «частота + интервал».
 *
 * «Каждые сколько месяцев: 1» рядом с выбором «каждый месяц» — это один
 * и тот же вопрос, заданный дважды. Модель остаётся общей (частота и шаг),
 * форма предлагает те пять вариантов, которыми пользуются.
 */
const PRESETS = [
  { key: 'daily', freq: 'daily', interval: 1 },
  { key: 'weekly', freq: 'weekly', interval: 1 },
  { key: 'monthly', freq: 'monthly', interval: 1 },
  { key: 'quarterly', freq: 'monthly', interval: 3 },
  { key: 'yearly', freq: 'yearly', interval: 1 },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

function presetOf(freq: string, interval: number): PresetKey | null {
  return PRESETS.find((p) => p.freq === freq && p.interval === interval)?.key ?? null;
}

export function RecurringFormModal({ rule, onClose }: RecurringFormModalProps) {
  const { t, locale } = useT();
  const { user } = useMe();
  const accounts = useAccounts();
  const categories = useCategories();
  const currencies = useCurrencies();
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule();

  const isEdit = rule !== undefined;
  const open = (accounts.data ?? []).filter((a) => !a.isArchived);

  const [name, setName] = useState(rule?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(rule?.kind ?? 'expense');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [amount, setAmount] = useState(rule ? toMoney(rule.amount) : '');
  /**
   * Валюта суммы. Пустая строка — «как у счёта»: так выбор сам следует
   * за сменой счёта, пока человек не указал валюту явно.
   */
  const [currency, setCurrency] = useState(rule?.currencyCode ?? '');
  // null — расписание, заведённое не отсюда: «каждые два месяца» через API.
  // Такое показывается отдельной строкой и не теряется при сохранении.
  const [preset, setPreset] = useState<PresetKey | null>(
    rule ? presetOf(rule.freq, rule.interval) : 'monthly',
  );
  const [startOn, setStartOn] = useState(rule?.startOn ?? todayIn(user?.timezone ?? 'UTC'));
  const [endOn, setEndOn] = useState(rule?.endOn ?? '');
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
  const accountCurrency =
    open.find((a) => a.id === selectedAccountId)?.currencyCode ?? rule?.accountCurrency ?? '';
  const entryCurrency = currency || accountCurrency;
  const schedule = PRESETS.find((p) => p.key === preset);
  // День повторения берётся из даты списания, поэтому про короткий месяц
  // спрашиваем, только когда она попадает на 29-е и дальше — и только
  // у месячных и годовых правил, где короткий месяц вообще случается.
  const needsPolicy =
    (schedule?.freq === 'monthly' || schedule?.freq === 'yearly') &&
    Number(startOn.slice(8, 10)) > 28;

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

    // Частоту и шаг отправляем, только если человек выбрал вариант из
    // списка: иначе правило оставляет своё — то самое «каждые два месяца».
    const timing = schedule
      ? { freq: schedule.freq, interval: schedule.interval }
      : rule
        ? { freq: rule.freq, interval: rule.interval }
        : { freq: 'monthly' as const, interval: 1 };

    const scheduleInput = {
      ...timing,
      monthEndPolicy,
      // День недели и число месяца выводятся из даты списания: спрашивать
      // о них отдельно значит спрашивать дважды об одном.
      dayOfMonth: null,
      weekday: null,
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
            ...scheduleInput,
          },
        });
        toast.success(t('recurring.updated'));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          accountId: selectedAccountId,
          ...(entryCurrency && entryCurrency !== accountCurrency
            ? { currency: entryCurrency }
            : {}),
          categoryId: categoryId === '' ? null : categoryId,
          kind,
          amount: parsed,
          startOn,
          ...scheduleInput,
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

          <div className={styles.amountRow}>
            <Field
              label={t('transactions.amount')}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />

            {/* Валюта списания: счёт в рублях, подписка в долларах — обычное
                дело, и сумма тогда задаётся в долларах. Пересчёт по курсу
                на день списания делает сервер, курс остаётся в операции. */}
            <Select
              label={t('recurring.currency')}
              value={entryCurrency}
              disabled={isEdit}
              onChange={(e) =>
                setCurrency(e.currentTarget.value === accountCurrency ? '' : e.currentTarget.value)
              }
            >
              {(currencies.data ?? []).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code}
                </option>
              ))}
            </Select>
          </div>

          <Select
            label={t('recurring.freq')}
            value={preset ?? 'custom'}
            onChange={(e) => setPreset(e.currentTarget.value as PresetKey)}
          >
            {/* Расписание, заведённое не отсюда, остаётся в списке первой
                строкой: иначе сохранение формы молча переписало бы его. */}
            {preset === null && rule && (
              <option value="custom">{scheduleText(rule, t, locale)}</option>
            )}
            {PRESETS.map((item) => (
              <option key={item.key} value={item.key}>
                {t(`recurring.repeat.${item.key}`)}
              </option>
            ))}
          </Select>

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
              hint={t('recurring.startOnHint')}
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
