/**
 * Название валюты на языке интерфейса.
 *
 * В справочнике имена лежат на одном языке, и в английском интерфейсе
 * «Белорусский рубль» выглядел ровно так же неуместно, как выглядел бы
 * «Belarusian Ruble» в русском. Переводить их в базе не нужно: ISO-4217
 * знает `Intl`, и он же знает оба наших языка.
 *
 * Для криптовалют `Intl` бессилен — там остаётся имя из справочника,
 * и это не потеря: «Bitcoin» и «Tether» одинаковы на любом языке.
 */
export function currencyName(code: string, fallback: string, locale: string): string {
  // Код не из ISO-4217 (USDT — четыре буквы) роняет Intl с RangeError,
  // а не возвращает пустоту.
  if (code.length !== 3) return fallback;

  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(locale, { type: 'currency' }).of(code);
  } catch {
    return fallback;
  }

  // Неизвестную валюту Intl возвращает самим кодом — для BTC это «BTC».
  if (!name || name === code) return fallback;

  // Русские названия Intl отдаёт со строчной буквы: «белорусский рубль».
  // В списке рядом с кодом это читается как опечатка.
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}
