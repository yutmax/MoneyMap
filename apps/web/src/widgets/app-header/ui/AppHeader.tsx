import { NavLink, Outlet, useNavigate } from 'react-router';
import { useMe } from '@/entities/user';
import { LogoutButton } from '@/features/auth-logout';
import { ThemeToggle } from '@/features/theme-switch';
import { ROUTES } from '@/shared/config';
import { cx } from '@/shared/lib';
import styles from './AppHeader.module.scss';

const NAV = [
  { to: ROUTES.home, label: 'Обзор' },
  { to: ROUTES.sessions, label: 'Устройства' },
  { to: ROUTES.settings, label: 'Настройки' },
];

function NavLinks() {
  return NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === ROUTES.home}
      className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
    >
      {item.label}
    </NavLink>
  ));
}

/** Каркас защищённой области: шапка с навигацией и слот под страницу. */
export function AppHeader() {
  const { user } = useMe();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to={ROUTES.home} className={styles.brand}>
            MoneyMap
          </NavLink>

          <nav className={styles.nav} aria-label="Основная навигация">
            <NavLinks />
          </nav>

          <div className={cx(styles.actions, styles.spacer)}>
            {user && <span className={styles.user}>{user.name}</span>}
            <ThemeToggle />
            <LogoutButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
          </div>
        </div>

        <nav className={styles.mobileNav} aria-label="Навигация">
          <NavLinks />
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
