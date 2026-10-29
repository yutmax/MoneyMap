import { CurrencyConverter } from '@/features/currency-converter';
import { useT } from '@/shared/i18n';
import styles from './ConverterPage.module.scss';

/**
 * Конвертер валют. Страница без своей логики: заголовок стоит в шапке,
 * а здесь только пояснение, откуда курс, и сам инструмент.
 */
export function ConverterPage() {
  const { t } = useT();

  return (
    <div className={styles.root}>
      <p className={styles.subtitle}>{t('converter.subtitle')}</p>
      <CurrencyConverter />
    </div>
  );
}
