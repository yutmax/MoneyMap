// Именованный импорт, а не default: decimal.js — CJS, и под NodeNext
// default-биндинг разрешается в namespace, а не в класс. Пакет специально
// выставляет Decimal.Decimal = Decimal именно для этого случая.
import { Decimal } from 'decimal.js';

/**
 * Деньги в MoneyMap — всегда строка, арифметика — всегда decimal.js.
 * Причина в §5.1 спеки: number ломается на 18 знаках Ethereum, BIGINT минорных
 * единиц переполняется на тех же 18 знаках.
 *
 * precision: 40 покрывает NUMERIC(38, 18) из БД с запасом на промежуточные
 * результаты умножения на курс.
 */
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});

/** Денежное значение в транспортном виде: десятичная строка без экспоненты. */
export type MoneyString = string;

/** Разрядность NUMERIC(38, 18) из §7. */
export const MONEY_PRECISION = 38;
export const MONEY_SCALE = 18;
export const MONEY_MAX_INTEGER_DIGITS = MONEY_PRECISION - MONEY_SCALE;

/** Десятичная строка со знаком: "-0.5", "1234.56", "42". Экспонента запрещена. */
export const MONEY_PATTERN = /^-?\d{1,20}(\.\d{1,18})?$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function isMoneyString(value: unknown): value is MoneyString {
  return typeof value === 'string' && MONEY_PATTERN.test(value);
}

export function toDecimal(value: MoneyString | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    // number допускается только как литерал в коде (курсы из фикстур, нули).
    if (!Number.isFinite(value)) throw new MoneyError(`Не конечное число: ${value}`);
    return new Decimal(value);
  }
  if (!isMoneyString(value)) throw new MoneyError(`Некорректное денежное значение: ${value}`);
  return new Decimal(value);
}

/** Приводит Decimal к транспортной строке: фиксированная запись, без хвостовых нулей. */
export function toMoney(value: Decimal | MoneyString | number): MoneyString {
  const d = toDecimal(value);
  if (d.decimalPlaces() > MONEY_SCALE) {
    throw new MoneyError(`Больше ${MONEY_SCALE} знаков после запятой: ${d.toFixed()}`);
  }
  const digits = d.trunc().abs().toFixed();
  if (digits !== '0' && digits.length > MONEY_MAX_INTEGER_DIGITS) {
    throw new MoneyError(`Больше ${MONEY_MAX_INTEGER_DIGITS} знаков в целой части`);
  }
  return d.toFixed();
}

export const ZERO: MoneyString = '0';

export function add(a: MoneyString, b: MoneyString): MoneyString {
  return toMoney(toDecimal(a).plus(toDecimal(b)));
}

export function subtract(a: MoneyString, b: MoneyString): MoneyString {
  return toMoney(toDecimal(a).minus(toDecimal(b)));
}

export function negate(a: MoneyString): MoneyString {
  return toMoney(toDecimal(a).negated());
}

export function abs(a: MoneyString): MoneyString {
  return toMoney(toDecimal(a).abs());
}

export function sum(values: readonly MoneyString[]): MoneyString {
  return toMoney(values.reduce((acc, v) => acc.plus(toDecimal(v)), new Decimal(0)));
}

/** -1 | 0 | 1 */
export function compare(a: MoneyString, b: MoneyString): -1 | 0 | 1 {
  return toDecimal(a).comparedTo(toDecimal(b)) as -1 | 0 | 1;
}

export function isZero(a: MoneyString): boolean {
  return toDecimal(a).isZero();
}

export function isNegative(a: MoneyString): boolean {
  return toDecimal(a).isNegative() && !toDecimal(a).isZero();
}

/**
 * Деление с точностью до MONEY_SCALE.
 *
 * Нужно ровно для одного: вывести кросс-курс перевода из двух сумм (§7.2).
 * Деление единственное из денежных действий, которое не может быть точным,
 * поэтому результат округляется до предельной разрядности — дальше он
 * хранится как есть и больше не пересчитывается.
 */
export function divide(a: MoneyString, b: MoneyString): MoneyString {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new MoneyError('Деление на ноль');
  return toMoney(toDecimal(a).div(divisor).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP));
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MONEY_SCALE) {
    throw new MoneyError(`Некорректная разрядность валюты: ${decimals}`);
  }
}

/**
 * Конвертация по курсу с округлением до разрядности целевой валюты.
 * Курс фиксируется в транзакции (§5.2) — здесь только арифметика.
 *
 * Округление идёт до перевода в строку, а не после. Сумма и курс хранят по
 * 18 знаков каждая, их произведение — до 36, и промежуточная строка просто
 * не является денежной: `toMoney` на ней падает. Поймать это удалось только
 * на реальном курсе (0.84690935 за евро), потому что до мультивалютности
 * курс всегда был единицей.
 */
export function convert(
  amount: MoneyString,
  rate: MoneyString,
  targetDecimals: number,
): MoneyString {
  assertDecimals(targetDecimals);
  return toMoney(
    toDecimal(amount).times(toDecimal(rate)).toDecimalPlaces(targetDecimals, Decimal.ROUND_HALF_UP),
  );
}

/** Округление до разрядности валюты (`currencies.decimals`), half-up. */
export function quantize(amount: MoneyString, decimals: number): MoneyString {
  assertDecimals(decimals);
  return toMoney(toDecimal(amount).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP));
}

/**
 * Курс из внешнего источника.
 *
 * Источники отдают курс числом в JSON, и короткая запись double'а легко
 * оказывается длиннее денежной колонки: 1.2345678901234567e-5 — это
 * двадцать один знак после запятой. Поэтому значение округляется здесь,
 * на входе, а не падает ошибкой вставки где-то в фоновой задаче.
 *
 * Возвращает null на всём, что курсом быть не может: не число, не конечное,
 * не положительное или настолько мелкое, что от него в колонке остался ноль.
 * Решение, что делать с пропуском, принимает загрузчик — он умеет взять
 * последний известный курс (§8.5).
 */
export function parseRate(value: unknown): MoneyString | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    return null;
  }
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) return null;

  const rounded = decimal.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
  if (rounded.isZero()) return null;
  try {
    return toMoney(rounded);
  } catch {
    return null;
  }
}

/**
 * Обратный курс. Нужен, когда в exchange_rates лежит только одна сторона пары.
 * Делит с запасом точности, чтобы не потерять знаки на мелких криптокурсах.
 */
export function invertRate(rate: MoneyString): MoneyString {
  const d = toDecimal(rate);
  if (d.isZero()) throw new MoneyError('Курс не может быть нулевым');
  return toMoney(new Decimal(1).dividedBy(d).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP));
}

/**
 * Разбор суммы, введённой человеком: допускает запятую как разделитель,
 * пробелы-разделители разрядов (включая узкий неразрывный из Intl) и знак минус.
 */
export function parseUserAmount(input: string): MoneyString {
  const normalized = input
    .trim()
    .replace(/[\s\u00a0\u202f\u2009']/g, '')
    .replace(',', '.');
  if (normalized === '' || normalized === '-') throw new MoneyError('Пустая сумма');
  if (!MONEY_PATTERN.test(normalized)) throw new MoneyError(`Не похоже на сумму: ${input}`);
  return toMoney(normalized);
}

/**
 * Форматирование для вывода: сначала сумма, затем обозначение валюты.
 *
 * Порядок задан нами, а не локалью. `Intl` со `style: 'currency'` ставит
 * код перед числом в английской локали и после — в русской, и одна и та же
 * строка интерфейса прыгала бы при смене языка. В приложении, где колонка
 * сумм читается сверху вниз, число должно начинаться в одном и том же месте.
 *
 * Заодно исчезла ветка для криптовалют: `Intl` не знает BTC и бросал
 * RangeError, а форматирование простого числа работает для любого кода.
 */
export function formatMoney(
  amount: MoneyString,
  options: {
    currency: string;
    decimals: number;
    locale?: string;
    signDisplay?: 'auto' | 'always' | 'never';
    /** Знак валюты из справочника. Без него показывается код. */
    symbol?: string;
  },
): string {
  const { currency, decimals, locale = 'ru', signDisplay = 'auto', symbol } = options;
  const value = Number(toDecimal(amount).toFixed(Math.min(decimals, 18)));

  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: Math.min(decimals, 20),
    signDisplay,
  }).format(value);

  // Неразрывный пробел: сумма и её валюта не должны расходиться по строкам.
  return `${number}\u00a0${symbol ?? currency}`;
}
