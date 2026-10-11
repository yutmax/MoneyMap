import { LOCALES } from '@moneymap/shared';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './LocaleSwitch.module.scss';

/**
 * Переключатель языка рядом с переключателем темы.
 *
 * Названия языков не переводятся: «Русский» остаётся «Русским» и в английском
 * интерфейсе. Человек, попавший на незнакомый язык, ищет своё название, а не
 * его перевод на тот язык, которого не понимает.
 */
export function LocaleSwitch() {
  const { t, locale, setLocale } = useT();

  return (
    <div className={styles.root} role="group" aria-label={t('locale.group')}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className={cx(styles.option, locale === option && styles.active)}
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          title={t(`locale.${option}`)}
          lang={option}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
