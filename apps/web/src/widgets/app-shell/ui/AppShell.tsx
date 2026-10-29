import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useNotifications } from '@/entities/reconciliation';
import { useMe } from '@/entities/user';
import { LogoutIconButton } from '@/features/auth-logout';
import { ThemeToggle } from '@/features/theme-switch';
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

/**
 * Заголовок страницы для верхней строки.
 *
 * Таблицей по адресу, а не через контекст, который страница заполняет при
 * монтировании: заголовок нужен в той же отрисовке, что и сам переход, а
 * выставленный эффектом он успевал бы мигнуть пустотой. `useMatches` взять
 * нельзя — он работает только с data-роутером, а здесь обычный `<Routes>`.
 *
 * Цена — добавить сюда строку при добавлении страницы. Это та же дисциплина,
 * что и строка в роутере, и забытый заголовок виден сразу.
 */
const TITLES: Record<string, string> = {
  [ROUTES.home]: 'dashboard.title',
  [ROUTES.transactions]: 'transactions.title',
  [ROUTES.recurring]: 'recurring.title',
  [ROUTES.accounts]: 'accounts.title',
  [ROUTES.reconciliation]: 'reconciliation.title',
  [ROUTES.categories]: 'categories.title',
  [ROUTES.reports]: 'reports.title',
  [ROUTES.converter]: 'converter.title',
  [ROUTES.sessions]: 'sessions.title',
  // У профиля своего заголовка нет: на странице стоит имя человека, а это
  // не название раздела.
  [ROUTES.profile]: 'nav.profile',
  [ROUTES.notifications]: 'notifications.title',
};

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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useMe();
  const notifications = useNotifications();

  const titleKey = TITLES[pathname];

  // Неподтверждённый email теперь живёт в уведомлениях, а не баннером на
  // главной, поэтому и в счётчик он входит наравне с остальными.
  // `user` здесь ещё и undefined (грузится) и null (не вошёл) — отсюда `?.`.
  const emailPending = user?.emailVerified === false;
  const unread =
    (notifications.data ?? []).filter((item) => item.readAt === null).length +
    (emailPending ? 1 : 0);

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

        {/* Переключатель темы внизу панели: он нужен раз в полгода и не
            должен стоять в одном ряду с разделами, которыми пользуются
            каждый день. На телефоне он остаётся в профиле — места в нижней
            панели нет. */}
        <div className={styles.railFooter}>
          <ThemeToggle />
        </div>
      </aside>

      <div className={styles.column}>
        <header className={styles.header}>
          {/*
            Заголовок страницы стоит здесь, а не на самой странице: он один
            на раздел и не меняется от того, что на странице происходит.
            На телефоне он занимает место марки — название раздела в этой
            строке полезнее логотипа, а на главную уводит нижняя панель.
          */}
          {titleKey !== undefined && <h1 className={styles.pageTitle}>{t(titleKey)}</h1>}

          <div className={styles.headerActions}>
            {/* Конвертер — в шапке, а не шестой вкладкой: в нижней панели
                места на шестую нет, а здесь он в одном нажатии с любого
                экрана — как и нужно инструменту «прикинуть, сколько это». */}
            <NavLink
              to={ROUTES.converter}
              className={({ isActive }) => cx(styles.bell, isActive && styles.headerActive)}
              aria-label={t('converter.title')}
              title={t('converter.title')}
            >
              <Icon name="converter" className={styles.icon} />
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

            <LogoutIconButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
          </div>
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
