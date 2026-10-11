/**
 * Календарная дата как строка 'YYYY-MM-DD'.
 *
 * Весь учёт привязан к дате без времени: операция происходит «пятого числа»,
 * а не «пятого в 14:32 по Минску». Поэтому Date здесь — только инструмент
 * вычисления, в модели его нет.
 */
export type IsoDate = string;

/** Дата из Date по UTC. */
export function isoDateOf(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/**
 * Сегодня по UTC.
 *
 * Для курсов валют это и есть правильная дата: источники датируют свои
 * наборы по UTC, и дата в exchange_rates обязана совпадать с их датой,
 * иначе один и тот же курс лёг бы в две разные строки.
 */
export function todayUtc(): IsoDate {
  return isoDateOf(new Date());
}

/**
 * Сегодня в указанной таймзоне.
 *
 * Для даты операции брать UTC нельзя: в полночь по Минску приложение
 * предложило бы вчерашнее число, и человек каждый раз правил бы его руками.
 *
 * 'en-CA' выбран не для языка, а за формат: эта локаль даёт ровно
 * 'YYYY-MM-DD', и собирать строку из частей вручную не нужно.
 */
export function todayIn(timeZone: string): IsoDate {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    // Неизвестная таймзона не повод отказываться отвечать: дата по UTC
    // отличается от нужной не больше чем на сутки.
    return todayUtc();
  }
}

/** Дата, сдвинутая на days суток. Отрицательное значение — в прошлое. */
export function shiftDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return isoDateOf(shifted);
}
