/**
 * Подпись категории на языке интерфейса.
 *
 * С сервера приходит ключ каталога — `groceries`, `salary`, — а не готовый
 * текст: по тому же правилу, что и сообщения об ошибках (§10.5). Текст
 * появляется здесь, в одном месте на всю клиентскую сторону.
 *
 * Отсюда и приятное следствие: смена языка переименовывает категории сразу,
 * без повторного запроса — ключи в кеше TanStack Query уже лежат.
 *
 * `t` передаётся параметром, а не берётся хуком: функция зовётся и из
 * `map()` по строкам отчёта, где хук не вызвать.
 */
export function categoryName(t: (key: string) => string, key: string): string {
  return t(`defaults.categories.${key}`);
}

/** То же для операций без категории: у перевода и ключа нет. */
export function categoryNameOrNull(
  t: (key: string) => string,
  key: string | null | undefined,
): string | null {
  return key === null || key === undefined ? null : categoryName(t, key);
}
