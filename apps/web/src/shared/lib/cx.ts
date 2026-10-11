/**
 * Склейка имён классов. Отдельной зависимости (clsx/classnames) здесь не нужно:
 * с CSS Modules имена приходят из объекта стилей, и вся задача — выбросить
 * undefined и false.
 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
