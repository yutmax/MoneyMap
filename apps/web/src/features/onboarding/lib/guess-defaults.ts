/**
 * Предзаполнение онбординга по данным браузера: почти всегда угадывается
 * верно, а поправить — один выбор из списка.
 */
export function guessDefaults(): { timezone: string; currency: string } {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const byRegion: Record<string, string> = {
    BY: 'BYN',
    UA: 'UAH',
    PL: 'PLN',
    KZ: 'KZT',
    GE: 'GEL',
    TR: 'TRY',
    CZ: 'CZK',
    GB: 'GBP',
    CH: 'CHF',
    JP: 'JPY',
    US: 'USD',
  };
  const region = new Intl.Locale(resolved.locale).region ?? '';
  return {
    timezone: resolved.timeZone,
    currency: byRegion[region] ?? 'EUR',
  };
}
