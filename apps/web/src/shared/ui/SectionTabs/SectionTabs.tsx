import { NavLink } from 'react-router';
import { cx } from '@/shared/lib';
import styles from './SectionTabs.module.scss';

export interface SectionTab {
  to: string;
  label: string;
}

/**
 * Переключатель внутри раздела: операции и подписки, счета и сверка.
 *
 * Ссылки, а не состояние: у каждой половины свой адрес, её можно открыть
 * из закладки и вернуться назад кнопкой браузера. Состояние выглядело бы
 * так же и теряло бы и то, и другое.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav className={styles.root}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => cx(styles.tab, isActive && styles.active)}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
