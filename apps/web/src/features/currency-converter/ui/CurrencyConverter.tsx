import { convert, divide, quantize, type MoneyString } from '@moneymap/shared';
import { useEffect, useId, useState } from 'react';
import { CurrencySelect, useCurrencies } from '@/entities/currency';
import { useRate } from '@/entities/rate';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import { formatAmountInput, parseAmountInput } from '../lib/amount-input.ts';
import styles from './CurrencyConverter.module.scss';

type Side = 'from' | 'to';

interface ConverterState {
  from: string;
  to: string;
  /** Что набрано в поле, которое правили последним. Второе поле — вычисляемое. */
  text: string;
  side: Side;
}

const STORAGE_KEY = 'moneymap.converter';
const DEFAULT_AMOUNT = '100';

/**
 * Последняя пара и сумма — удобство одного человека на одном устройстве,
 * поэтому localStorage. Он может быть недоступен (приватный режим, запрет
 * сайта), и тогда конвертер просто открывается с умолчаниями.
 */
function loadSaved(): Partial<ConverterState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<ConverterState>;
    return {
      ...(typeof data.from === 'string' ? { from: data.from } : {}),
      ...(typeof data.to === 'string' ? { to: data.to } : {}),
      ...(typeof data.text === 'string' ? { text: data.text } : {}),
    };
  } catch {
    return {};
  }
}

function save(state: ConverterState, fromText: string): void {
  try {
    // Сохраняется верхнее поле: открыв конвертер снова, человек видит ту же
    // сумму в той же валюте, а не пересчёт по уже другому курсу снизу вверх.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ from: state.from, to: state.to, text: fromText }),
    );
  } catch {
    // Не сохранилось — в следующий раз будут умолчания, это не ошибка.
  }
}

/**
 * Пересчёт по курсу без исключений: сумма в двадцать знаков, умноженная на
 * курс, может не влезть в денежный формат, и это повод оставить поле пустым,
 * а не уронить страницу.
 */
function safely(compute: () => MoneyString): MoneyString | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

/**
 * Конвертер валют и криптовалют.
 *
 * Оба поля ввода равноправны: правишь верхнее — пересчитывается нижнее,
 * и наоборот. Хранится только то, что набрал человек, и сторона, где он это
 * набрал; второе число выводится из курса на каждой отрисовке. Так поля не
 * могут разойтись, а смена валюты или курса не затирает набранное.
 *
 * Курс пары приходит с сервера один раз, умножение — здесь, той же функцией
 * `convert`, что считает сервер. Поэтому пересчёт мгновенный: на каждую
 * цифру нет запроса.
 */
export function CurrencyConverter() {
  const { t, locale } = useT();
  const { user } = useMe();
  const currencies = useCurrencies();
  const fromId = useId();
  const toId = useId();

  const [state, setState] = useState<ConverterState>(() => {
    const saved = loadSaved();
    const base = user?.baseCurrency ?? 'EUR';
    const to = saved.to ?? base;
    const from = saved.from ?? (to === 'USD' ? 'EUR' : 'USD');
    return { from, to, text: saved.text ?? DEFAULT_AMOUNT, side: 'from' };
  });
  // Счётчик поворотов значка: каждое нажатие докручивает его ещё на пол-оборота.
  const [turns, setTurns] = useState(0);

  const rate = useRate(state.from, state.to);
  const decimalsOf = (code: string) => currencies.data?.find((c) => c.code === code)?.decimals ?? 2;

  const parsed = parseAmountInput(state.text);
  const rateValue = rate.data?.rate;

  const computed = (() => {
    if (parsed.kind !== 'ok' || rateValue === undefined) return null;
    return state.side === 'from'
      ? safely(() => convert(parsed.value, rateValue, decimalsOf(state.to)))
      : safely(() => quantize(divide(parsed.value, rateValue), decimalsOf(state.from)));
  })();

  const computedText =
    computed === null
      ? ''
      : formatAmountInput(
          computed,
          decimalsOf(state.side === 'from' ? state.to : state.from),
          locale,
        );

  const fromText = state.side === 'from' ? state.text : computedText;
  const toText = state.side === 'to' ? state.text : computedText;

  useEffect(() => {
    // Недописанное «12abc» не сохраняется: открыть конвертер с ошибкой хуже,
    // чем с последней правильной суммой.
    if (parseAmountInput(fromText).kind === 'invalid') return;
    save(state, fromText);
  }, [state, fromText]);

  const edit = (side: Side) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, side, text: event.target.value }));

  /**
   * Набранное число приводится к тому же виду, что и посчитанное, когда
   * человек уходит из поля: «1000000» читается хуже, чем «1 000 000,00».
   * Пока поле в фокусе, его не трогают — каретка не должна прыгать.
   */
  const tidy = (side: Side) => () =>
    setState((s) => {
      if (s.side !== side) return s;
      const current = parseAmountInput(s.text);
      if (current.kind !== 'ok') return s;
      const code = side === 'from' ? s.from : s.to;
      return { ...s, text: formatAmountInput(current.value, decimalsOf(code), locale) };
    });

  /**
   * Валюты меняются местами, сумма в верхнем поле остаётся: «100 USD в RUB»
   * превращается в «100 RUB в USD». Так делают привычные конвертеры, и так
   * понятно, что именно произошло, — меняется вопрос, а не набранное число.
   */
  const swap = () => {
    setTurns((n) => n + 1);
    setState((s) => ({ from: s.to, to: s.from, text: fromText, side: 'from' }));
  };

  const invalid = parsed.kind === 'invalid';
  const waiting = parsed.kind === 'ok' && rate.isPending;

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.amountBox}>
            <label className="visually-hidden" htmlFor={fromId}>
              {t('converter.amountIn', { code: state.from })}
            </label>
            <input
              id={fromId}
              className={cx(
                styles.amount,
                state.side === 'from' && invalid && styles.invalid,
                state.side === 'to' && styles.computed,
              )}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={fromText}
              placeholder={state.side === 'to' && waiting ? '…' : '0'}
              onChange={edit('from')}
              onBlur={tidy('from')}
              aria-invalid={state.side === 'from' && invalid ? true : undefined}
            />
          </div>
          <CurrencySelect
            label={t('converter.from')}
            value={state.from}
            onChange={(event) => setState((s) => ({ ...s, from: event.target.value }))}
          />
        </div>

        <div className={styles.swapLine}>
          <button
            type="button"
            className={styles.swap}
            onClick={swap}
            aria-label={t('converter.swap')}
            title={t('converter.swap')}
          >
            <Icon
              name="swap"
              className={styles.swapIcon}
              style={{ transform: `rotate(${turns * 180}deg)` }}
            />
          </button>
        </div>

        <div className={styles.row}>
          <div className={styles.amountBox}>
            <label className="visually-hidden" htmlFor={toId}>
              {t('converter.amountIn', { code: state.to })}
            </label>
            <input
              id={toId}
              className={cx(
                styles.amount,
                state.side === 'to' && invalid && styles.invalid,
                state.side === 'from' && styles.computed,
              )}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={toText}
              placeholder={state.side === 'from' && waiting ? '…' : '0'}
              onChange={edit('to')}
              onBlur={tidy('to')}
              aria-invalid={state.side === 'to' && invalid ? true : undefined}
            />
          </div>
          <CurrencySelect
            label={t('converter.to')}
            value={state.to}
            onChange={(event) => setState((s) => ({ ...s, to: event.target.value }))}
          />
        </div>
      </div>

      {/* Строка о курсе — живой регион: после смены валюты скринридер
          прочитает новый курс, не заставляя искать его глазами. */}
      <div className={styles.info} aria-live="polite">
        {invalid && <p className={styles.error}>{t('converter.invalid')}</p>}
        {rate.isError && (
          <p className={styles.error}>
            {t(
              rate.error.message.startsWith('errors.')
                ? rate.error.message
                : 'converter.rateFailed',
            )}
          </p>
        )}
        {rate.data && (
          <>
            <p className={styles.rate}>
              <RateLine from={state.from} to={state.to} rate={rate.data.rate} locale={locale} />
            </p>
            <p className={styles.meta}>
              {rate.data.stale
                ? t('converter.staleOn', { date: formatDate(rate.data.date, locale) })
                : t('converter.rateOn', { date: formatDate(rate.data.date, locale) })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * «1 USD = 90,91 RUB». Шесть значащих цифр: у пары с криптовалютой курс
 * бывает 0,0000149, и обычные два знака после запятой показали бы ноль.
 * Здесь это подпись, а не расчёт, поэтому округление через Number допустимо.
 */
function RateLine({
  from,
  to,
  rate,
  locale,
}: {
  from: string;
  to: string;
  rate: string;
  locale: string;
}) {
  const format = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 });
  const value = Number(rate);
  return (
    <>
      <span>
        1 {from} = {format.format(value)} {to}
      </span>
      {value > 0 && (
        <span className={styles.inverse}>
          1 {to} = {format.format(1 / value)} {from}
        </span>
      )}
    </>
  );
}
