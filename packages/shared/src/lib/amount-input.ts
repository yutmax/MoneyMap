import { MONEY_PATTERN, toMoney, type MoneyString } from './money.ts';

/**
 * Разбор суммы, которую человек набирает прямо сейчас (конвертер валют).
 *
 * Мягче, чем `parseUserAmount`: пустое поле и «12,» — это не ошибка, а сумма,
 * которую ещё набирают. Поэтому три исхода, а не два.
 */
export type ParsedAmount =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: MoneyString };

/** Разделитель разрядов в `formatAmountInput` — неразрывный пробел. */
const GROUP = '\u00a0';

/**
 * Принимает и запятую, и точку, в любой роли — откуда бы ни пришло число.
 *
 * Раньше любая запятая считалась десятичной, и «2,500.00» — ровно то, что
 * конвертер сам выводил в английской локали, — разбиралось в «2.500.00»,
 * то есть в ошибку. На iPhone с английским языком это ломало конвертер
 * после первой же цифры.
 *
 * Правила:
 *  - пробелы и апострофы — всегда разделители разрядов;
 *  - есть и запятая, и точка — десятичная та, что последней, вторая
 *    разделяет разряды («1,234.5» и «1.234,5» — одно и то же число);
 *  - один знак встречается несколько раз — это разряды («1,000,000»), но
 *    только если группы ровно по три цифры: «1,5,» — опечатка, а не миллион;
 *  - один знак один раз — десятичный. «1,5» с русской клавиатуры iPhone
 *    и «1.5» с английской означают одно.
 */
export function parseAmountInput(input: string): ParsedAmount {
  let text = input.trim().replace(/[\s\u00a0\u202f\u2009'’]/g, '');
  if (text === '') return { kind: 'empty' };
  if (/[^\d.,]/.test(text)) return { kind: 'invalid' };

  // «12,» и «12.» — сумма в процессе набора: десятичная часть ещё впереди.
  const last = text.at(-1);
  if (last === ',' || last === '.') {
    text = text.slice(0, -1);
    if (text === '') return { kind: 'empty' };
    // Знак, оставшийся в конце, — десятичный; второй такой же раньше в
    // строке («1,5,») — опечатка, а не разряды.
    if (text.includes(last)) return { kind: 'invalid' };
    // Раз десятичный знак уже набран, второй вид знака может быть только
    // разрядами: «1,234.» — это тысяча двести тридцать четыре, а не 1,234.
    const group = last === ',' ? '.' : ',';
    if (text.includes(group)) {
      if (!isGrouped(text, group)) return { kind: 'invalid' };
      text = text.split(group).join('');
    }
  }

  const commas = text.split(',').length - 1;
  const dots = text.split('.').length - 1;
  let integer = text;
  let fraction = '';

  if (commas > 0 && dots > 0) {
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const group = decimal === ',' ? '.' : ',';
    const at = text.lastIndexOf(decimal);
    integer = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (integer.includes(decimal) || fraction.includes(group)) return { kind: 'invalid' };
    if (!isGrouped(integer, group)) return { kind: 'invalid' };
    integer = integer.split(group).join('');
  } else if (commas + dots > 1) {
    const group = commas > 0 ? ',' : '.';
    if (!isGrouped(text, group)) return { kind: 'invalid' };
    integer = text.split(group).join('');
  } else if (commas + dots === 1) {
    [integer = '', fraction = ''] = text.split(/[.,]/);
    if (integer === '') integer = '0';
  }

  const candidate = fraction === '' ? integer : `${integer}.${fraction}`;
  if (!MONEY_PATTERN.test(candidate)) return { kind: 'invalid' };
  return { kind: 'ok', value: toMoney(candidate) };
}

/** «1,234,567»: первая группа из одной–трёх цифр, остальные ровно по три. */
function isGrouped(value: string, group: string): boolean {
  const [head = '', ...rest] = value.split(group);
  return /^\d{1,3}$/.test(head) && rest.every((part) => /^\d{3}$/.test(part));
}

/**
 * Сумма для поля ввода: разряды через неразрывный пробел, десятичный знак
 * по локали.
 *
 * Разряды — всегда пробелом, а не по локали. В английской локали это была бы
 * запятая, и «1,000» в иене (без дробной части) уже не отличить от «1,000»
 * как «единица и три нуля после запятой». Пробел ни с чем не путается, и
 * всё, что вывел конвертер, разбирается обратно в то же число.
 *
 * Без `Intl` поверх Number: у криптовалют восемь знаков после запятой, и
 * double на крупной сумме их теряет — строка разбирается как строка.
 *
 * Дробная часть дополняется до двух знаков, если валюта их знает: «90,9 ₽»
 * читается как недописанное число.
 */
export function formatAmountInput(value: MoneyString, decimals: number, locale: string): string {
  const [integer = '0', fraction = ''] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  const padded = fraction.padEnd(Math.min(decimals, 2), '0');
  if (padded === '') return grouped;
  return `${grouped}${decimalSeparator(locale)}${padded}`;
}

function decimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal');
  return part?.value ?? '.';
}
