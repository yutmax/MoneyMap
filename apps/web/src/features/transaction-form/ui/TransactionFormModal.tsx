import { parseUserAmount, toMoney, type TransactionResponse } from '@moneymap/shared';
import { useMemo, useState } from 'react';
import { useAccounts } from '@/entities/account';
import { useCategories } from '@/entities/category';
import { useT } from '@/shared/i18n';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import {
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransaction,
} from '../api/use-transaction-mutations.ts';
import styles from './TransactionFormModal.module.scss';

type Mode = 'expense' | 'income' | 'transfer';

interface TransactionFormModalProps {
  transaction?: TransactionResponse;
  onClose: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Одно окно на три вида операции.
 *
 * Поля у дохода и расхода совпадают, а перевод отличается двумя счетами
 * вместо счёта с категорией — разносить это по трём экранам значило бы
 * заставлять человека сначала угадать, куда идти.
 */
export function TransactionFormModal({ transaction, onClose }: TransactionFormModalProps) {
  const { t } = useT();
  const accounts = useAccounts();
  const categories = useCategories();
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
  const [occurredOn, setOccurredOn] = useState(transaction?.occurredOn ?? today());
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
      if (isEdit) {
        await update.mutateAsync({
          id: transaction.id,
          input: {
            amount: parsed,
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

          <Field
            label={t('transactions.amount')}
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
          />

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
