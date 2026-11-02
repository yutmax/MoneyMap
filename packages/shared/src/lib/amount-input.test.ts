import { describe, expect, it } from 'vitest';
import { formatAmountInput, parseAmountInput } from './amount-input.ts';

const NBSP = String.fromCharCode(0xa0);
const ok = (value: string) => ({ kind: 'ok', value });

/**
 * Разбор суммы в конвертере. Главный случай — тот, на котором он сломался:
 * iPhone с английским языком, где запятая разделяет разряды, а не дробь.
 */
describe('parseAmountInput', () => {
  it('понимает и запятую, и точку как десятичный знак', () => {
    expect(parseAmountInput('1,5')).toEqual(ok('1.5'));
    expect(parseAmountInput('1.5')).toEqual(ok('1.5'));
    expect(parseAmountInput(',5')).toEqual(ok('0.5'));
  });

  it('разбирает английскую запись с запятыми в разрядах', () => {
    expect(parseAmountInput('2,500.00')).toEqual(ok('2500'));
    expect(parseAmountInput('1,234,567.89')).toEqual(ok('1234567.89'));
    expect(parseAmountInput('1,000,000')).toEqual(ok('1000000'));
  });

  it('разбирает европейскую запись с точками в разрядах', () => {
    expect(parseAmountInput('1.234,5')).toEqual(ok('1234.5'));
    expect(parseAmountInput('1.000.000')).toEqual(ok('1000000'));
  });

  it('пропускает пробелы любого вида и апострофы', () => {
    expect(parseAmountInput(`2${NBSP}500${NBSP}000,25`)).toEqual(ok('2500000.25'));
    expect(parseAmountInput("1'000.5")).toEqual(ok('1000.5'));
    expect(parseAmountInput(' 12 ')).toEqual(ok('12'));
  });

  it('считает недописанную сумму суммой, а не ошибкой', () => {
    expect(parseAmountInput('')).toEqual({ kind: 'empty' });
    expect(parseAmountInput(',')).toEqual({ kind: 'empty' });
    expect(parseAmountInput('12,')).toEqual(ok('12'));
    expect(parseAmountInput('1,234.')).toEqual(ok('1234'));
  });

  it('отвергает то, что числом не является', () => {
    for (const input of ['12abc', '-5', '1,5,', '1,2,3', '1,23,456', '1.2,3.4', '1,5.2,3']) {
      expect(parseAmountInput(input), input).toEqual({ kind: 'invalid' });
    }
  });

  it('держит восемь знаков криптовалюты', () => {
    expect(parseAmountInput('0,15370149')).toEqual(ok('0.15370149'));
  });
});

describe('formatAmountInput', () => {
  it('ставит разряды пробелом в любой локали', () => {
    expect(formatAmountInput('2500000', 2, 'ru')).toBe(`2${NBSP}500${NBSP}000,00`);
    expect(formatAmountInput('2500000', 2, 'en')).toBe(`2${NBSP}500${NBSP}000.00`);
    expect(formatAmountInput('1000', 0, 'en')).toBe(`1${NBSP}000`);
  });

  it('не теряет знаков крипты и дополняет фиат до двух', () => {
    expect(formatAmountInput('0.15370149', 8, 'ru')).toBe('0,15370149');
    expect(formatAmountInput('90.9', 2, 'ru')).toBe('90,90');
  });

  it('выводит то, что разбирается обратно в то же число', () => {
    const cases: Array<[string, number]> = [
      ['2500', 2],
      ['1234567.89', 2],
      ['1000', 0],
      ['12345.6789', 8],
    ];
    for (const locale of ['ru', 'en', 'de']) {
      for (const [value, decimals] of cases) {
        const text = formatAmountInput(value, decimals, locale);
        expect(parseAmountInput(text), `${locale} ${text}`).toEqual(ok(value));
      }
    }
  });
});
