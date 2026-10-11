import { isLocale, parseMessage, type Locale } from '@moneymap/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type Params = Record<string, string | number>;

/**
 * Перевод для компонентов.
 *
 * Отличается от голого `useTranslation().t` одним: принимает не только ключ,
 * но и строку с упакованными параметрами, которую собрал `msg()` в схемах
 * zod. Благодаря этому ошибка валидации — и своя, и пришедшая от API —
 * переводится тем же вызовом, что и обычная подпись:
 *
 *   t('auth.login.title')
 *   t(errors.password?.message)   // 'validation.password.min::{"count":8}'
 */
export function useT() {
  const { t, i18n } = useTranslation();

  const translate = useCallback(
    (message: string | undefined | null, params?: Params): string => {
      if (!message) return '';
      const parsed = parseMessage(message);
      return t(parsed.key, { ...parsed.params, ...params, defaultValue: parsed.key });
    },
    [t],
  );

  const locale: Locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'ru';

  return {
    t: translate,
    locale,
    setLocale: (next: Locale) => void i18n.changeLanguage(next),
  };
}
