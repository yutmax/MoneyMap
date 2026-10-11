import { detectTimezone } from '@/shared/ui';

/**
 * Предзаполнение онбординга по данным браузера: почти всегда угадывается
 * верно, а поправить — один выбор из списка.
 */
export function guessDefaults(): { timezone: string; currency: string } {
  const byRegion: Record<string, string> = {
    BY: 'BYN',
    RU: 'RUB',
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

  let region = '';
  try {
    region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).region ?? '';
  } catch {
    // Экзотическая локаль — останется валюта по умолчанию.
  }

  return {
    timezone: detectTimezone(),
    currency: byRegion[region] ?? 'EUR',
  };
}
