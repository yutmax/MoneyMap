import { MONEY_PATTERN, toMoney, type MoneyString } from '@moneymap/shared';

/**
 * Разбор того, что человек набрал в поле суммы.
 *
 * Мягче, чем `parseUserAmount`: пустое поле и одинокая запятая — это не
 * ошибка, а сумма, которую ещё набирают. Поэтому три исхода, а не два.
 */
export type ParsedAmount =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: MoneyString };

export function parseAmountInput(input: string): ParsedAmount {
  const normalized = input
    .trim()
    // Пробелы-разделители разрядов, в том числе те, что вставил сам
    // конвертер в посчитанную сумму: её можно взять и править дальше.
    .replace(/[\s\u00a0\u202f\u2009']/g, '')
    .replace(',', '.');

  if (normalized === '' || normalized === '.') return { kind: 'empty' };
  // «12.» — сумма в процессе набора; считаем её как 12, а не как ошибку.
  const candidate = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
  if (!MONEY_PATTERN.test(candidate) || candidate.startsWith('-')) return { kind: 'invalid' };
  return { kind: 'ok', value: toMoney(candidate) };
}

/**
 * Посчитанная сумма для поля ввода: с разделителями разрядов и десятичным
 * знаком локали, чтобы её было легко прочитать.
 *
 * Без `Intl` со `style: 'decimal'` поверх Number: у криптовалют восемь знаков
 * после запятой, и double на крупной сумме их теряет. Целая часть идёт через
 * BigInt, дробная остаётся строкой как есть.
 *
 * Дробная часть дополняется до двух знаков, если валюта их знает: «90,9 ₽»
 * читается как недописанное число.
 */
export function formatAmountInput(value: MoneyString, decimals: number, locale: string): string {
  const [integer = '0', fraction = ''] = value.split('.');
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(integer));
  const minFraction = Math.min(decimals, 2);
  const padded = fraction.padEnd(minFraction, '0');
  if (padded === '') return grouped;

  const separator =
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  return `${grouped}${separator}${padded}`;
}
