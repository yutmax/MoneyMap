/**
 * Название страны по коду ISO-3166-1 на языке интерфейса.
 *
 * Сервер хранит код, а не название: «Belarus» в русском интерфейсе выглядел
 * бы ровно так же неуместно, как «Беларусь» в английском, а список стран
 * на двух языках — это то, что Intl уже знает.
 */
export function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'region' }).of(code) ?? code;
  } catch {
    // Неизвестный локали код Intl возвращает как есть, а на совсем кривом
    // бросает RangeError — в обоих случаях показываем сам код.
    return code;
  }
}
