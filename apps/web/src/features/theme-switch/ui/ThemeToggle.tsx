import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, type IconName } from '@/shared/ui';
import { useTheme, type ThemeChoice } from '../model/use-theme.ts';
import styles from './ThemeToggle.module.scss';

/**
 * Две темы, без пункта «как в системе».
 *
 * Системная настройка никуда не делась — она решает, с какой темы приложение
 * откроется. Но отдельной кнопкой она была третьим состоянием, которое почти
 * никто не выбирает руками, и загромождала переключатель из двух осмысленных
 * вариантов.
 */
const OPTIONS: Array<{ value: ThemeChoice; icon: IconName }> = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
];

export function ThemeToggle() {
  const { t } = useT();
  const { choice, setChoice } = useTheme();

  return (
    // role="group" с подписью: кнопки без него читаются скринридером
    // как несвязанный набор.
    <div className={styles.root} role="group" aria-label={t('theme.group')}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx(styles.option, choice === option.value && styles.active)}
          onClick={() => setChoice(option.value)}
          aria-pressed={choice === option.value}
          title={t(`theme.${option.value}`)}
        >
          <Icon name={option.icon} className={styles.icon} />
          <span className="visually-hidden">{t(`theme.${option.value}`)}</span>
        </button>
      ))}
    </div>
  );
}
