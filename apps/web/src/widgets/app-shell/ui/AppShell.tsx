import { NavLink, Outlet } from 'react-router';
import { useNotifications } from '@/entities/reconciliation';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Icon, type IconName } from '@/shared/ui';
import styles from './AppShell.module.scss';

/**
 * Каркас приложения: снизу вкладки на телефоне, сбоку панель на широком экране.
 *
 * Один список разделов на оба случая — расходятся они только раскладкой,
 * и держать для этого два набора ссылок значит однажды забыть добавить
 * раздел в один из них.
 *
 * Пять разделов, не больше: шестой не влезает в нижнюю панель так, чтобы
 * в него попадал палец. Всё, что осталось за ними, живёт внутри разделов —
 * категории и устройства в профиле, сверка у счетов, подписки у операций.
 */
const TABS: { to: string; key: string; icon: IconName; end?: boolean }[] = [
  { to: ROUTES.home, key: 'nav.overview', icon: 'home', end: true },
  { to: ROUTES.transactions, key: 'nav.transactions', icon: 'transactions' },
  { to: ROUTES.accounts, key: 'nav.accounts', icon: 'accounts' },
  { to: ROUTES.reports, key: 'nav.reports', icon: 'reports' },
  { to: ROUTES.profile, key: 'nav.profile', icon: 'profile' },
];

function Tabs({ variant }: { variant: 'bar' | 'rail' }) {
  const { t } = useT();

  return TABS.map((tab) => (
    <NavLink
      key={tab.to}
      to={tab.to}
      end={tab.end ?? false}
      className={({ isActive }) =>
        cx(styles[variant === 'bar' ? 'tab' : 'railLink'], isActive && styles.active)
      }
    >
      <Icon name={tab.icon} className={styles.icon} />
      {/* В нижней панели подпись скрыта, но не удалена: ссылка без текста
          безымянна для скринридера, а значок именем не является. В боковой
          панели места хватает, и там подпись видимая. */}
      <span className={variant === 'bar' ? 'visually-hidden' : styles.label}>{t(tab.key)}</span>
    </NavLink>
  ));
}

export function AppShell() {
  const { t } = useT();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((item) => item.readAt === null).length;

  return (
    <div className={styles.root}>
      {/* Боковая панель появляется с планшета и заменяет нижнюю. */}
      <aside className={styles.rail}>
        <NavLink to={ROUTES.home} className={styles.brand}>
          {t('common.appName')}
        </NavLink>
        <nav className={styles.railNav} aria-label={t('nav.aria')}>
          <Tabs variant="rail" />
        </nav>
      </aside>

      <div className={styles.column}>
        <header className={styles.header}>
          <NavLink to={ROUTES.home} className={styles.brandMobile}>
            {t('common.appName')}
          </NavLink>

          <NavLink
            to={ROUTES.notifications}
            className={styles.bell}
            aria-label={t('notifications.title')}
          >
            <Icon name="bell" className={styles.icon} />
            {/* Счётчик, а не точка: «три непрочитанных» и «одно» — разные
                новости, и узнать это до открытия полезно. */}
            {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
          </NavLink>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <nav className={styles.bar} aria-label={t('nav.aria')}>
        <Tabs variant="bar" />
      </nav>
    </div>
  );
}
