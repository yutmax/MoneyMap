import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { useTheme, type ThemeChoice } from '../model/use-theme.ts';
import styles from './ThemeToggle.module.scss';

const OPTIONS: Array<{ value: ThemeChoice; icon: string }> = [
  {
    value: 'light',
    icon: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4',
  },
  { value: 'system', icon: 'M3 5h18v11H3zM8 20h8' },
  { value: 'dark', icon: 'M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9Z' },
];

export function ThemeToggle() {
  const { t } = useT();
  const { choice, setChoice } = useTheme();

  return (
    // role="group" с подписью: три кнопки без него читаются скринридером
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
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {option.value === 'light' && <circle cx="12" cy="12" r="4" />}
            <path d={option.icon} />
          </svg>
          <span className="visually-hidden">{t(`theme.${option.value}`)}</span>
        </button>
      ))}
    </div>
  );
}
