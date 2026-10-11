import { NavLink, Outlet, useNavigate } from 'react-router';
import { useMe } from '@/entities/user';
import { LogoutButton } from '@/features/auth-logout';
import { LocaleSwitch } from '@/features/locale-switch';
import { ThemeToggle } from '@/features/theme-switch';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import styles from './AppHeader.module.scss';

const NAV = [
  { to: ROUTES.home, key: 'nav.overview' },
  { to: ROUTES.accounts, key: 'nav.accounts' },
  { to: ROUTES.transactions, key: 'nav.transactions' },
  { to: ROUTES.categories, key: 'nav.categories' },
  { to: ROUTES.sessions, key: 'nav.devices' },
  { to: ROUTES.settings, key: 'nav.settings' },
];

function NavLinks() {
  const { t } = useT();

  return NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === ROUTES.home}
      className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
    >
      {t(item.key)}
    </NavLink>
  ));
}

/** Каркас защищённой области: шапка с навигацией и слот под страницу. */
export function AppHeader() {
  const { t } = useT();
  const { user } = useMe();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to={ROUTES.home} className={styles.brand}>
            {t('common.appName')}
          </NavLink>

          <nav className={styles.nav} aria-label={t('nav.aria')}>
            <NavLinks />
          </nav>

          <div className={cx(styles.actions, styles.spacer)}>
            {user && <span className={styles.user}>{user.name}</span>}
            <LocaleSwitch />
            <ThemeToggle />
            <LogoutButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
          </div>
        </div>

        <nav className={styles.mobileNav} aria-label={t('nav.ariaShort')}>
          <NavLinks />
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
