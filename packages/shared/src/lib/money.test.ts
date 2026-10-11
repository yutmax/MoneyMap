import { describe, expect, it } from 'vitest';
import {
  divide,
  abs,
  add,
  compare,
  convert,
  formatMoney,
  invertRate,
  isMoneyString,
  MoneyError,
  parseRate,
  parseUserAmount,
  quantize,
  subtract,
  sum,
  toMoney,
} from './money.ts';

/**
 * Тесты денежной арифметики (§10.4) — с упором на то, из-за чего балансы
 * расходятся на практике: округление, точность крипты, границы NUMERIC(38,18).
 */

describe('базовая арифметика', () => {
  it('складывает без ошибки плавающей точки', () => {
    // В number это 0.30000000000000004 — главная причина, по которой
    // деньги в проекте строки.
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('держит точность на 18 знаках Ethereum', () => {
    expect(add('0.000000000000000001', '0.000000000000000002')).toBe('0.000000000000000003');
  });

  it('суммирует длинный список без накопления погрешности', () => {
    const values = Array.from({ length: 1000 }, () => '0.01');
    expect(sum(values)).toBe('10');
  });

  it('вычитает и берёт модуль', () => {
    expect(subtract('100', '129.99')).toBe('-29.99');
    expect(abs('-29.99')).toBe('29.99');
  });

  it('сравнивает как числа, а не как строки', () => {
    // Лексикографически '9' > '10' — поэтому сравнение не может быть строковым.
    expect(compare('9', '10')).toBe(-1);
    expect(compare('10.0', '10')).toBe(0);
  });
});

describe('границы NUMERIC(38, 18)', () => {
  it('отвергает больше 18 знаков после запятой', () => {
    expect(() => toMoney('0.0000000000000000001')).toThrow(MoneyError);
  });

  it('отвергает больше 20 знаков в целой части', () => {
    expect(() => toMoney('999999999999999999999')).toThrow(MoneyError);
  });

  it('принимает ровно граничные значения', () => {
    expect(toMoney('99999999999999999999.999999999999999999')).toBe(
      '99999999999999999999.999999999999999999',
    );
  });

  it('не принимает экспоненциальную запись', () => {
    expect(isMoneyString('1e18')).toBe(false);
    expect(() => toMoney('1e18')).toThrow(MoneyError);
  });
});

describe('округление до разрядности валюты', () => {
  it('округляет half-up, а не к ближайшему чётному', () => {
    // Банковское округление (half-even) дало бы 2.66 — для денег пользователя
    // ожидаемо арифметическое.
    expect(quantize('2.665', 2)).toBe('2.67');
    expect(quantize('2.675', 2)).toBe('2.68');
  });

  it('работает с нулевой разрядностью (JPY)', () => {
    expect(quantize('1234.5', 0)).toBe('1235');
  });

  it('отвергает невозможную разрядность', () => {
    expect(() => quantize('1', -1)).toThrow(MoneyError);
    expect(() => quantize('1', 19)).toThrow(MoneyError);
  });
});

describe('конвертация по курсу', () => {
  it('переводит фиат в фиат с округлением до 2 знаков', () => {
    expect(convert('100', '0.924', 2)).toBe('92.4');
    expect(convert('33.33', '1.0876', 2)).toBe('36.25');
  });

  it('переводит фиат в BTC с 8 знаками', () => {
    // 1000 USD по курсу 0.0000152 BTC/USD
    expect(convert('1000', '0.0000152', 8)).toBe('0.0152');
  });

  it('не теряет мелкие суммы крипты при конвертации', () => {
    expect(convert('0.00000001', '1', 8)).toBe('0.00000001');
  });

  it('обращает курс', () => {
    expect(invertRate('0.5')).toBe('2');
    expect(() => invertRate('0')).toThrow(MoneyError);
  });

  it('выдерживает курс со всеми 18 знаками', () => {
    // 18 знаков у суммы и 18 у курса дают 36 в произведении — больше, чем
    // бывает у денежной строки. Округлять нужно до неё, а не после.
    // Ровно на этом падал снимок net worth при курсе 0.846909350000000000.
    expect(convert('920', '0.846909350000000000', 2)).toBe('779.16');
    expect(convert('0.123456789012345678', '0.987654321098765432', 18)).toBe(
      '0.121932631137021794',
    );
  });
});

describe('курс из внешнего источника', () => {
  it('принимает числа JSON, в том числе экспоненциальную запись', () => {
    expect(parseRate(3.408666)).toBe('3.408666');
    expect(parseRate(1.2e-7)).toBe('0.00000012');
  });

  it('обрезает знаки, которых не выдерживает колонка', () => {
    // Короткая запись double'а бывает длиннее 18 знаков после запятой —
    // такое значение в NUMERIC(38, 18) не влезает.
    const rate = parseRate('0.000012345678901234567');
    expect(rate).not.toBeNull();
    expect((rate as string).split('.')[1]?.length).toBeLessThanOrEqual(18);
  });

  it('отвергает всё, что курсом быть не может', () => {
    expect(parseRate(0)).toBeNull();
    expect(parseRate(-1)).toBeNull();
    expect(parseRate(Number.NaN)).toBeNull();
    expect(parseRate(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseRate(null)).toBeNull();
    expect(parseRate('нет')).toBeNull();
    // Меньше 1e-18: в колонке от такого курса остался бы ноль.
    expect(parseRate(1e-25)).toBeNull();
  });
});

describe('разбор ввода пользователя', () => {
  it('принимает запятую как разделитель', () => {
    expect(parseUserAmount('1234,56')).toBe('1234.56');
  });

  it('выбрасывает разделители разрядов, включая узкий неразрывный пробел', () => {
    // Именно такой пробел подставляет Intl.NumberFormat в ru-локали,
    // и он попадает в поле ввода при копировании значения из интерфейса.
    expect(parseUserAmount('1 234 567,89')).toBe('1234567.89');
  });

  it('принимает отрицательные суммы', () => {
    expect(parseUserAmount(' -42.5 ')).toBe('-42.5');
  });

  it('отвергает мусор', () => {
    expect(() => parseUserAmount('')).toThrow(MoneyError);
    expect(() => parseUserAmount('-')).toThrow(MoneyError);
    expect(() => parseUserAmount('сто рублей')).toThrow(MoneyError);
    expect(() => parseUserAmount('1.2.3')).toThrow(MoneyError);
  });
});

describe('деление', () => {
  it('выводит кросс-курс из двух сумм', () => {
    // 330 BYN за 100 USD — ровно то, как §7.2 получает курс перевода.
    expect(divide('330', '100')).toBe('3.3');
  });

  it('округляет бесконечную дробь до предельной разрядности', () => {
    const rate = divide('1', '3');
    expect(rate.startsWith('0.333333333333333333')).toBe(true);
    expect(rate.split('.')[1]?.length).toBeLessThanOrEqual(18);
  });

  it('деление на ноль — ошибка, а не Infinity', () => {
    expect(() => divide('100', '0')).toThrow(MoneyError);
  });
});

describe('форматирование', () => {
  it('ставит сумму перед валютой', () => {
    const result = formatMoney('1234.5', { currency: 'USD', decimals: 2, locale: 'en-US' });
    expect(result).toBe('1,234.50 USD');
  });

  it('порядок не зависит от локали', () => {
    // Intl со style: 'currency' поставил бы код перед числом в английской
    // локали и после — в русской. Нам нужно одинаково.
    const en = formatMoney('1234.5', { currency: 'USD', decimals: 2, locale: 'en-US' });
    const ru = formatMoney('1234.5', { currency: 'USD', decimals: 2, locale: 'ru' });
    expect(en.endsWith('USD')).toBe(true);
    expect(ru.endsWith('USD')).toBe(true);
  });

  it('показывает знак валюты, когда он известен', () => {
    const result = formatMoney('2404.18', {
      currency: 'BYN',
      decimals: 2,
      locale: 'en-US',
      symbol: 'Br',
    });
    expect(result).toBe('2,404.18 Br');
  });

  it('работает с криптовалютой, которой Intl не знает', () => {
    const result = formatMoney('0.12345678', { currency: 'BTC', decimals: 8, locale: 'en-US' });
    expect(result).toBe('0.12345678 BTC');
  });

  it('показывает знак числа, когда попросили', () => {
    const result = formatMoney('250', {
      currency: 'EUR',
      decimals: 2,
      locale: 'en-US',
      signDisplay: 'always',
    });
    expect(result).toContain('+');
  });
});
