export interface ParsedUserAgent {
  /** Готовая к показу строка: «Chrome на Windows». */
  device: string;
  browser: string | null;
  os: string | null;
}

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\/[\d.]+/i, 'Edge'],
  [/\bOPR\/[\d.]+|\bOpera\b/i, 'Opera'],
  [/\bYaBrowser\/[\d.]+/i, 'Yandex Browser'],
  [/\bVivaldi\/[\d.]+/i, 'Vivaldi'],
  [/\bFirefox\/[\d.]+|\bFxiOS\//i, 'Firefox'],
  [/\bCriOS\/[\d.]+/i, 'Chrome'],
  [/\bChrome\/[\d.]+/i, 'Chrome'],
  [/\bSafari\/[\d.]+/i, 'Safari'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/\bWindows NT 10\.0/i, 'Windows'],
  [/\bWindows\b/i, 'Windows'],
  [/\b(iPhone|iPod)\b/i, 'iPhone'],
  [/\biPad\b/i, 'iPad'],
  [/\bAndroid\b/i, 'Android'],
  [/\b(Macintosh|Mac OS X)\b/i, 'macOS'],
  [/\bCrOS\b/i, 'ChromeOS'],
  [/\bLinux\b/i, 'Linux'],
];

/**
 * Разбор User-Agent для списка устройств (§6.4).
 *
 * Сознательно эвристический и без зависимости: строка нужна только чтобы
 * человек узнал своё устройство в списке. Ошибка в распознавании экзотического
 * браузера ничего не ломает, а библиотека для парсинга UA — лишняя
 * поверхность для обновлений в проекте, где это одна подпись в интерфейсе.
 */
export function parseUserAgent(raw: string | undefined | null): ParsedUserAgent {
  if (!raw) return { device: 'Неизвестное устройство', browser: null, os: null };

  const browser = BROWSERS.find(([pattern]) => pattern.test(raw))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(raw))?.[1] ?? null;

  const device =
    browser && os ? `${browser} на ${os}` : (browser ?? os ?? 'Неизвестное устройство');

  return { device, browser, os };
}
