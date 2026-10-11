export interface TimezoneOption {
  /** IANA-идентификатор: 'Europe/Minsk'. */
  value: string;
  /** Как показать в списке: 'Минск (UTC+03:00)'. */
  label: string;
  /** Регион для группировки: 'Europe'. */
  area: string;
  /** Смещение в минутах — по нему сортируются зоны внутри региона. */
  offsetMinutes: number;
}

/** Зона браузера. Отдельно, потому что нужна и как значение по умолчанию. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function supportedTimezones(): string[] {
  try {
    // supportedValuesOf появился в 2022 году. Если его нет, выбирать не из
    // чего — остаётся зона самого браузера, и она же единственная верная
    // догадка.
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/** 'GMT+03:00' → 180, 'GMT' → 0. */
function offsetMinutesOf(formatted: string): number {
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(formatted);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function describe(zone: string): { label: string; offsetMinutes: number } {
  const now = new Date();

  let offsetText = 'GMT';
  try {
    offsetText =
      new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  } catch {
    // Зона из списка, но не поддержана форматтером — оставляем GMT.
  }

  // Город берётся из самого идентификатора и не переводится: Intl умеет
  // переводить названия зон только вместе со временем, отдельного «названия
  // города» в нём нет. Язык влияет только на порядок сортировки.
  const city = (zone.split('/').pop() ?? zone).replaceAll('_', ' ');

  return {
    label: `${city} (${offsetText.replace('GMT', 'UTC')})`,
    offsetMinutes: offsetMinutesOf(offsetText),
  };
}

/**
 * Список зон, сгруппированный по регионам и отсортированный по смещению.
 *
 * Считается один раз на язык: около четырёхсот зон, и для каждой создаётся
 * форматтер — на каждый рендер это заметно.
 */
const cache = new Map<string, TimezoneOption[]>();

export function timezoneOptions(locale: string): TimezoneOption[] {
  const cached = cache.get(locale);
  if (cached) return cached;

  const zones = supportedTimezones();
  const detected = detectTimezone();
  // Зона браузера обязана быть в списке, даже если Intl её не перечислил:
  // иначе select молча покажет не то, что стоит в значении.
  const all = zones.includes(detected) ? zones : [detected, ...zones];

  const options = all
    .map((zone) => {
      const { label, offsetMinutes } = describe(zone);
      return {
        value: zone,
        label,
        area: zone.includes('/') ? (zone.split('/')[0] ?? 'Other') : 'Other',
        offsetMinutes,
      };
    })
    .sort((a, b) =>
      a.area === b.area
        ? a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label, locale)
        : a.area.localeCompare(b.area, locale),
    );

  cache.set(locale, options);
  return options;
}
