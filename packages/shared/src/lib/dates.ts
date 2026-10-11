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
  return dateIn(timeZone, new Date());
}

/** Дата момента в указанной таймзоне. */
export function dateIn(timeZone: string, at: Date): IsoDate {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // Неизвестная таймзона не повод отказываться отвечать: дата по UTC
    // отличается от нужной не больше чем на сутки.
    return isoDateOf(at);
  }
}

/**
 * Местное время момента, 'ЧЧ:ММ'.
 *
 * hourCycle: 'h23' задан явно: с hour12: false часть локалей печатает
 * полночь как 24:00, и сравнение времён ломается ровно в тот час, когда
 * его труднее всего заметить.
 */
export function timeIn(timeZone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** Дата, сдвинутая на days суток. Отрицательное значение — в прошлое. */
export function shiftDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return isoDateOf(shifted);
}

/** Сколько суток от a до b. Отрицательное, если b раньше. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Сколько календарных месяцев от a до b, без учёта числа. */
export function monthsBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am] = a.split('-').map(Number) as [number, number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number, number];
  return (by - ay) * 12 + (bm - am);
}

/** День недели: 0 — воскресенье, 6 — суббота (как у Date.getUTCDay). */
export function weekdayOf(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Сколько суток в месяце. month — 1..12. */
export function daysInMonth(year: number, month: number): number {
  // Нулевой день следующего месяца — это последний день текущего.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Собирает дату из частей. Месяц — 1..12, выход за пределы нормализуется. */
export function isoFrom(year: number, month: number, day: number): IsoDate {
  return isoDateOf(new Date(Date.UTC(year, month - 1, day)));
}
