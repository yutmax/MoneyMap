import { DEFAULT_LOCALE, LOCALES, resources } from '@moneymap/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

export const LOCALE_STORAGE_KEY = 'moneymap.locale';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Один словарь на язык, одно пространство имён: разбивать на namespace
    // и подгружать их по частям имеет смысл на сотнях килобайт текста,
    // а не на полутора сотнях ключей.
    resources: Object.fromEntries(
      LOCALES.map((locale) => [locale, { translation: resources[locale] }]),
    ),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    // Иначе 'ru-RU' из браузера не найдёт словарь 'ru'.
    load: 'languageOnly',
    interpolation: {
      // React экранирует сам; двойное экранирование превращает кавычки
      // в &quot; прямо в тексте.
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

/** lang на <html> — для скринридеров, переносов и автоперевода браузера. */
function syncHtmlLang(language: string): void {
  document.documentElement.lang = language;
}

syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export { i18n };
