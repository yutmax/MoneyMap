import {
  abs,
  formatMoney,
  parseUserAmount,
  todayIn,
  toMoney,
  type TransactionResponse,
} from '@moneymap/shared';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAccounts } from '@/entities/account';
import { categoryColor, categoryName, useCategories } from '@/entities/category';
import { useCurrencies } from '@/entities/currency';
import { useConvert } from '@/entities/rate';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { Alert, Button, Field, Icon, isIconName, Modal, Select, toast } from '@/shared/ui';
import {
  useCreateTransaction,
  useCreateTransfer,
  useDeleteTransaction,
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
  const remove = useDeleteTransaction();
  // Удаление в два нажатия: первое спрашивает, второе удаляет. Отдельное
  // окно подтверждения поверх окна операции было бы третьим слоем.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [allCategories, setAllCategories] = useState(false);
  const dangerRef = useRef<HTMLDivElement>(null);

  // Вопрос об удалении — внизу длинной формы: подкручиваем к нему.
  useEffect(() => {
    if (confirmingDelete)
      dangerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [confirmingDelete]);

  const isEdit = transaction !== undefined;
  const [mode, setMode] = useState<Mode>(
    transaction ? (transaction.kind === 'transfer' ? 'transfer' : transaction.kind) : 'expense',
  );
  const [error, setError] = useState<string | null>(null);

  const open = (accounts.data ?? []).filter((a) => !a.isArchived);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? '');
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

  /**
   * Счёт по умолчанию вычисляется, а не кладётся в состояние.
   *
   * В первый рендер список счетов ещё не пришёл, и состояние осталось бы
   * пустым навсегда — при том что <select> уже показывает первый счёт.
   * Форма выглядела бы заполненной и уезжала на сервер с пустым accountId.
   */
  const selectedAccountId = accountId || open[0]?.id || '';

  const from = open.find((a) => a.id === selectedAccountId);
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

  /**
   * Плитки категорий свёрнуты до двух рядов: девятнадцать категорий расходов
   * целиком — это четыре ряда значков между суммой и кнопкой. В ряду четыре
   * плитки на телефоне и пять на широком экране (как в стилях), порог — два
   * ряда. Лента с прокруткой вбок здесь
   * не годится: мышью её не прокрутить, и обрезанная краем плитка выглядит
   * ошибкой, а не приглашением листать.
   *
   * Если выбранная категория оказалась бы в скрытой части (правка старой
   * операции), сетка открывается сразу: выбор должен быть виден.
   */
  const FOLD = (window.matchMedia('(width >= 30rem)').matches ? 5 : 4) * 2;
  const canCollapse = categoryOptions.length > FOLD;
  const selectedHidden = categoryOptions.findIndex((c) => c.id === categoryId) >= FOLD;
  const collapsed = canCollapse && !allCategories && !selectedHidden;

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
            fromAccountId: selectedAccountId,
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
            accountId: selectedAccountId,
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

  const deleteTransaction = () => {
    if (!transaction) return;
    remove.mutate(transaction.id, {
      onSuccess: () => {
        toast.success(t('transactions.deleted'));
        onClose();
      },
      onError: (err) => setError(err.message),
    });
  };

  const deleteControls = isEdit && (
    <div className={styles.danger} ref={dangerRef}>
      {confirmingDelete ? (
        <>
          <span className={styles.dangerAsk}>{t('transactions.deleteAsk')}</span>
          <Button variant="secondary" size="small" onClick={() => setConfirmingDelete(false)}>
            {t('accounts.deleteCancel')}
          </Button>
          <Button
            variant="danger"
            size="small"
            loading={remove.isPending}
            onClick={deleteTransaction}
          >
            {t('transactions.deleteConfirm')}
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="small" onClick={() => setConfirmingDelete(true)}>
          {t('transactions.delete')}
        </Button>
      )}
    </div>
  );

  /*
   * Перевод не правится: его ноги связаны второй суммой и курсом, и сервер
   * отказывает в изменении одной из них. Поэтому окно перевода — сводка
   * и удаление, без формы, которая заведомо не сохранится.
   */
  if (isEdit && transaction.kind === 'transfer') {
    return (
      <Modal open title={t('transactions.transferTitle')} onClose={onClose}>
        <div className={styles.form}>
          {error && <Alert>{t(error)}</Alert>}
          <dl className={styles.summary}>
            <dt>{t('transactions.account')}</dt>
            <dd>{transaction.accountName}</dd>
            <dt>{t('transactions.amount')}</dt>
            <dd>
              {formatMoney(transaction.amountAccount, {
                currency: transaction.accountCurrency,
                decimals:
                  currencies.data?.find((c) => c.code === transaction.accountCurrency)?.decimals ??
                  2,
                locale,
                signDisplay: 'always',
              })}
            </dd>
            <dt>{t('transactions.date')}</dt>
            <dd>{formatDate(transaction.occurredOn, locale)}</dd>
            {transaction.note && (
              <>
                <dt>{t('transactions.note')}</dt>
                <dd>{transaction.note}</dd>
              </>
            )}
          </dl>
          <p className={styles.hint}>{t('transactions.deleteTransferHint')}</p>
          {deleteControls}
        </div>
      </Modal>
    );
  }

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

        {/*
          Сумма — первой и крупно: с неё операция начинается в голове («кофе,
          четыре пятьдесят»), а счёт и дата почти всегда уже верные. Поле
          открывает цифровую клавиатуру телефона — своей на экране нет: системная
          знакома руке и умеет вставку.
        */}
        <div className={styles.amountHero}>
          <label className={styles.amountLabel}>
            <span className="visually-hidden">{t('transactions.amount')}</span>
            <input
              className={styles.amountInput}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />
          </label>

          {/* Валюта операции. Нужна, когда платёж за границей: чек приходит
              в валюте чека, а не в валюте карты (§8.5). У перевода её нет —
              там валюты заданы двумя счетами. */}
          {mode !== 'transfer' && (
            <div className={styles.amountCurrency}>
              <Select
                label={t('transactions.currency')}
                variant="pill"
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
            </div>
          )}
        </div>

        {/*
          Категория — плитками, а не списком: выбрать значок одним касанием
          быстрее, чем открыть список и найти в нём строку. Повторное нажатие
          снимает выбор — операция останется без категории.
        */}
        {mode !== 'transfer' && categoryOptions.length > 0 && (
          <div className={styles.pickBlock}>
            <div
              className={cx(styles.picks, collapsed && styles.picksCollapsed)}
              role="group"
              aria-label={t('transactions.category')}
            >
              {categoryOptions.map((category) => {
                const active = category.id === categoryId;
                const icon =
                  category.icon && isIconName(category.icon) ? category.icon : 'circle-ellipsis';
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={cx(styles.pick, active && styles.pickActive)}
                    onClick={() => setCategoryId(active ? '' : category.id)}
                    aria-pressed={active}
                  >
                    <span
                      className={styles.pickTile}
                      style={
                        { '--tile': categoryColor(category.id, categories.data) } as CSSProperties
                      }
                    >
                      <Icon name={icon} className={styles.pickGlyph} />
                    </span>
                    <span className={styles.pickName}>{categoryName(t, category.key)}</span>
                  </button>
                );
              })}
            </div>

            {canCollapse && (
              <button
                type="button"
                className={styles.picksToggle}
                onClick={() => setAllCategories((shown) => !shown)}
                aria-expanded={!collapsed}
              >
                {collapsed ? t('transactions.categoriesAll') : t('transactions.categoriesLess')}
              </button>
            )}
          </div>
        )}

        <div className={styles.fields}>
          <Select
            label={mode === 'transfer' ? t('transactions.accountFrom') : t('transactions.account')}
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

          {mode === 'transfer' && (
            <Select
              label={t('transactions.accountTo')}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.currentTarget.value)}
            >
              <option value="">—</option>
              {open
                .filter((a) => a.id !== selectedAccountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currencyCode}
                  </option>
                ))}
            </Select>
          )}

          {/* Сколько списалось со счёта. Можно не заполнять — посчитаем по
              курсу на дату. Сумма со счёта остаётся подсказкой под полем:
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

          {/* Сумма зачисления нужна только для кросс-валютного перевода:
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

        {deleteControls}
      </form>
    </Modal>
  );
}
