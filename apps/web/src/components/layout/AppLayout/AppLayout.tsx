import { NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useMe } from '@/api/auth.ts';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { cx } from '@/lib/cx.ts';
import styles from './AppLayout.module.scss';

const NAV = [
  { to: '/', label: 'Обзор' },
  { to: '/sessions', label: 'Устройства' },
  { to: '/settings', label: 'Настройки' },
];

function NavLinks() {
  return NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
    >
      {item.label}
    </NavLink>
  ));
}

export function AppLayout() {
  const { user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout.mutateAsync().catch(() => {
      // Выход не должен застревать из-за сетевой ошибки: куки на сервере
      // всё равно будут отозваны при следующем refresh, а локально нам
      // нечего хранить.
    });
    void navigate('/login', { replace: true });
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand}>
            MoneyMap
          </NavLink>

          <nav className={styles.nav} aria-label="Основная навигация">
            <NavLinks />
          </nav>

          <div className={cx(styles.actions, styles.spacer)}>
            {user && <span className={styles.user}>{user.name}</span>}
            <ThemeToggle />
            <Button
              variant="secondary"
              size="small"
              onClick={handleLogout}
              loading={logout.isPending}
            >
              Выйти
            </Button>
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
