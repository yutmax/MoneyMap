import {
  abs,
  formatMoney,
  parseUserAmount,
  todayIn,
  toMoney,
  type TransactionResponse,
} from '@moneymap/shared';
import { useMemo, useState } from 'react';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useConvert } from '@/entities/rate';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import {
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransaction,
} from '../api/use-transaction-mutations.ts';
import styles from './TransactionFormModal.module.scss';

type Mode = 'expense' | 'income' | 'transfer';

/**
 * Сумма для запроса курса. Недописанное число — это не ошибка, а состояние
 * поля посреди ввода, и подсказке незачем на него ругаться.
 */
function toSafeAmount(input: string): string {
  try {
    return parseUserAmount(input);
  } catch {
    return '0';
  }
}

interface TransactionFormModalProps {
  transaction?: TransactionResponse;
  onClose: () => void;
}

/**
 * Одно окно на три вида операции.
 *
 * Поля у дохода и расхода совпадают, а перевод отличается двумя счетами
 * вместо счёта с категорией — разносить это по трём экранам значило бы
 * заставлять человека сначала угадать, куда идти.
 */
export function TransactionFormModal({ transaction, onClose }: TransactionFormModalProps) {
  const { t, locale } = useT();
  const { user } = useMe();
  const accounts = useAccounts();
  const categories = useCategories();
  const currencies = useCurrencies();
  const create = useCreateTransaction();
  const transfer = useCreateTransfer();
  const update = useUpdateTransaction();

  const isEdit = transaction !== undefined;
  const [mode, setMode] = useState<Mode>(
    transaction ? (transaction.kind === 'transfer' ? 'transfer' : transaction.kind) : 'expense',
  );
  const [error, setError] = useState<string | null>(null);

  const open = (accounts.data ?? []).filter((a) => !a.isArchived);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? open[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [amount, setAmount] = useState(transaction ? toMoney(transaction.amountOriginal) : '');
  const [toAmount, setToAmount] = useState('');
  /**
   * Валюта введённой суммы. Пустая строка — «как у счёта»: так выбор сам
   * следует за сменой счёта, пока человек не указал валюту явно.
   */
  const [currency, setCurrency] = useState('');
  /** Сколько списалось со счёта. Пусто — сервер посчитает по курсу дня. */
  const [spent, setSpent] = useState(
    // Сравниваются коды валют, а не курс: из БД он приходит как
    // '1.000000000000000000' и ни одной строке '1' не равен.
    transaction && transaction.currencyOriginal !== transaction.accountCurrency
      ? toMoney(abs(transaction.amountAccount))
      : '',
  );
  // Дата берётся по таймзоне пользователя, а не по UTC: в полночь по Минску
  // форма предлагала бы вчерашнее число, и его правили бы руками каждый раз.
  const [occurredOn, setOccurredOn] = useState(
    transaction?.occurredOn ?? todayIn(user?.timezone ?? 'UTC'),
  );
  const [note, setNote] = useState(transaction?.note ?? '');

  /**
   * Ключ идемпотентности живёт столько же, сколько открытая форма (§8.3).
   * Второе нажатие кнопки и повтор на плохой сети приходят с тем же ключом,
   * и сервер возвращает уже созданную операцию вместо второй такой же.
   */
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const from = open.find((a) => a.id === accountId);
  const to = open.find((a) => a.id === toAccountId);
  const crossCurrency = mode === 'transfer' && from && to && from.currencyCode !== to.currencyCode;

  const accountCurrency = (isEdit ? transaction.accountCurrency : from?.currencyCode) ?? '';
  const entryCurrency = isEdit ? transaction.currencyOriginal : currency || accountCurrency;
  // Чужая валюта — вторая сумма: сколько на самом деле ушло со счёта (§8.5).
  const foreign =
    mode !== 'transfer' && accountCurrency !== '' && entryCurrency !== accountCurrency;

  // Подсказка со справочным курсом. Запрос уходит, только когда сумма уже
  // введена и валюты действительно разные.
  const reference = useConvert(
    { from: entryCurrency, to: accountCurrency, amount: toSafeAmount(amount), on: occurredOn },
    foreign && toSafeAmount(amount) !== '0',
  );
  const accountCurrencyMeta = currencies.data?.find((c) => c.code === accountCurrency);
  const spentHint =
    reference.data && accountCurrencyMeta
      ? t('transactions.spentHint', {
          amount: formatMoney(reference.data.converted, {
            currency: accountCurrency,
            decimals: accountCurrencyMeta.decimals,
            locale,
            ...(accountCurrencyMeta.symbol ? { symbol: accountCurrencyMeta.symbol } : {}),
          }),
        })
      : t('transactions.spentHintEmpty');

  const categoryOptions = (categories.data ?? []).filter(
    (c) => c.kind === (mode === 'income' ? 'income' : 'expense'),
  );

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

    try {
      const parsedSpent = foreign && spent.trim() !== '' ? parseUserAmount(spent) : undefined;

      if (isEdit) {
        await update.mutateAsync({
          id: transaction.id,
          input: {
            amount: parsed,
            ...(parsedSpent ? { amountAccount: parsedSpent } : {}),
            occurredOn,
            note: note.trim() === '' ? null : note.trim(),
            categoryId: categoryId === '' ? null : categoryId,
          },
        });
        toast.success(t('transactions.updated'));
      } else if (mode === 'transfer') {
        let parsedTo: string | undefined;
        if (crossCurrency) {
          try {
            parsedTo = parseUserAmount(toAmount);
          } catch {
            setError('validation.transfer.toAmountRequired');
            return;
          }
        }
        await transfer.mutateAsync({
          key: idempotencyKey,
          input: {
            fromAccountId: accountId,
            toAccountId,
            amount: parsed,
            ...(parsedTo ? { toAmount: parsedTo } : {}),
            occurredOn,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
        toast.success(t('transactions.created'));
      } else {
        await create.mutateAsync({
          key: idempotencyKey,
          input: {
            accountId,
            categoryId: categoryId === '' ? null : categoryId,
            kind: mode,
            amount: parsed,
            ...(foreign ? { currency: entryCurrency } : {}),
            ...(parsedSpent ? { amountAccount: parsedSpent } : {}),
            occurredOn,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
        toast.success(t('transactions.created'));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'errors.requestFailed');
    }
  };

  const busy = create.isPending || transfer.isPending || update.isPending;

  return (
    <Modal
      open
      title={isEdit ? t('transactions.editTitle') : t('transactions.createTitle')}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && <Alert>{t(error)}</Alert>}

        {/* Вид операции не меняется после создания: он определяет знак
            и состав полей. */}
        {!isEdit && (
          <div className={styles.modes} role="group">
            {(['expense', 'income', 'transfer'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? styles.modeActive : styles.mode}
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
              >
                {t(`transactions.${value}`)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.fields}>
          <Select
            label={mode === 'transfer' ? t('transactions.accountFrom') : t('transactions.account')}
            value={accountId}
            disabled={isEdit}
            onChange={(e) => setAccountId(e.currentTarget.value)}
          >
            {open.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currencyCode}
              </option>
            ))}
          </Select>

          {mode === 'transfer' ? (
            <Select
              label={t('transactions.accountTo')}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.currentTarget.value)}
            >
              <option value="">—</option>
              {open
                .filter((a) => a.id !== accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currencyCode}
                  </option>
                ))}
            </Select>
          ) : (
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
          )}

          <div className={styles.amountRow}>
            <Field
              label={t('transactions.amount')}
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />

            {/* Валюта суммы отдельным полем: покупка за границей вводится
                в валюте чека, а не в валюте карты (§8.5). У перевода её нет —
                там валюты заданы двумя счетами. */}
            {mode !== 'transfer' && (
              <Select
                label={t('transactions.currency')}
                value={entryCurrency}
                disabled={isEdit}
                onChange={(e) =>
                  setCurrency(
                    e.currentTarget.value === accountCurrency ? '' : e.currentTarget.value,
                  )
                }
              >
                {(currencies.data ?? []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Сколько списалось со счёта. Пустое поле — значит «по курсу дня»:
              подставлять справочное число в поле нельзя, человек увидит
              в выписке другое и не заметит подмены. */}
          {foreign && (
            <Field
              label={t('transactions.spent', { currency: accountCurrency })}
              inputMode="decimal"
              hint={spentHint}
              value={spent}
              onChange={(e) => setSpent(e.currentTarget.value)}
            />
          )}

          {/* Вторая сумма появляется ровно тогда, когда без неё не обойтись:
              счета в разных валютах, и курс выводится из двух чисел. */}
          {crossCurrency && (
            <Field
              label={t('transactions.amountReceived')}
              inputMode="decimal"
              hint={t('transactions.amountReceivedHint')}
              value={toAmount}
              onChange={(e) => setToAmount(e.currentTarget.value)}
            />
          )}

          <Field
            label={t('transactions.date')}
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.currentTarget.value)}
          />

          <Field
            label={t('transactions.note')}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </div>

        <Button type="submit" block loading={busy}>
          {isEdit ? t('transactions.save') : t('transactions.submit')}
        </Button>
      </form>
    </Modal>
  );
}
