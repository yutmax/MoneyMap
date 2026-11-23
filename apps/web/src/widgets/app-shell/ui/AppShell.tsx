import { todayIn } from '@moneymap/shared';
import { Suspense, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useNotifications } from '@/entities/reconciliation';
import { useMe } from '@/entities/user';
import { LogoutIconButton } from '@/features/auth-logout';
import { ThemeToggle } from '@/features/theme-switch';
import { TransactionFormModal } from '@/features/transaction-form';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { Icon, Logo, PageFallback, type IconName } from '@/shared/ui';
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
interface Tab {
  to: string;
  key: string;
  icon: IconName;
  end?: boolean;
}

const HOME: Tab = { to: ROUTES.home, key: 'nav.overview', icon: 'home', end: true };
const TRANSACTIONS: Tab = {
  to: ROUTES.transactions,
  key: 'nav.transactions',
  icon: 'transactions',
};
const ACCOUNTS: Tab = { to: ROUTES.accounts, key: 'nav.accounts', icon: 'accounts' };
const REPORTS: Tab = { to: ROUTES.reports, key: 'nav.reports', icon: 'reports' };
const RECURRING: Tab = { to: ROUTES.recurring, key: 'nav.recurring', icon: 'repeat' };
const PROFILE: Tab = { to: ROUTES.profile, key: 'nav.profile', icon: 'profile' };

/**
 * Наборы разделов расходятся намеренно.
 *
 * В боковой панели места хватает на всё, чем пользуются каждый день, а
 * профиль там — плашка с именем внизу. В нижней панели середину занимает
 * кнопка новой операции: внести трату — главное действие на телефоне, и
 * оно должно быть под большим пальцем с любого экрана. Счета на телефоне
 * открываются с главной, из блока счетов.
 */
const RAIL: Tab[] = [HOME, TRANSACTIONS, ACCOUNTS, REPORTS, RECURRING];
const BAR_START: Tab[] = [HOME, TRANSACTIONS];
const BAR_END: Tab[] = [REPORTS, PROFILE];

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

function Tabs({ tabs, variant }: { tabs: Tab[]; variant: 'bar' | 'rail' }) {
  const { t } = useT();

  return tabs.map((tab) => (
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
  const { t, locale } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useMe();
  const notifications = useNotifications();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  // Поиск в шапке — вход в ленту операций, а не отдельный экран: запрос
  // уезжает в адрес, и страница операций подхватывает его как свой фильтр.
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    void navigate(
      text ? ROUTES.transactions + '?search=' + encodeURIComponent(text) : ROUTES.transactions,
    );
    setQuery('');
  };

  const initials = (user?.name ?? '')
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
        <NavLink to={ROUTES.home} className={styles.brand} aria-label={t('common.appName')}>
          <Logo />
        </NavLink>
        <nav className={styles.railNav} aria-label={t('nav.aria')}>
          <Tabs tabs={RAIL} variant="rail" />
        </nav>

        {/* Переключатель темы внизу панели: он нужен раз в полгода и не
            должен стоять в одном ряду с разделами, которыми пользуются
            каждый день. На телефоне он остаётся в профиле — места в нижней
            панели нет. */}
        <div className={styles.railFooter}>
          <ThemeToggle />

          {/* Профиль — плашкой с именем, а не шестой строкой меню: это не
              раздел учёта, а «кто вошёл», и место ему там, где его ищут во
              всех рабочих приложениях. */}
          <div className={styles.user}>
            <NavLink
              to={ROUTES.profile}
              className={({ isActive }) => cx(styles.userLink, isActive && styles.userActive)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {initials}
              </span>
              <span className={styles.userText}>
                <span className={styles.userName}>{user?.name}</span>
                <span className={styles.userMeta}>{user?.baseCurrency}</span>
              </span>
            </NavLink>
            <LogoutIconButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
          </div>
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
          <div className={styles.heading}>
            {titleKey !== undefined && <h1 className={styles.pageTitle}>{t(titleKey)}</h1>}
            {/* Дата — только на главной: там она отвечает на «на какой день
                этот итог», на остальных страницах период задаёт сама страница. */}
            {pathname === ROUTES.home && (
              <p className={styles.pageDate}>
                {formatDate(todayIn(user?.timezone ?? 'UTC'), locale)}
              </p>
            )}
          </div>

          <div className={styles.headerActions}>
            <form className={styles.search} role="search" onSubmit={submitSearch}>
              <Icon name="search" className={styles.searchIcon} />
              <input
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('shell.search')}
                aria-label={t('shell.search')}
              />
            </form>

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

            <button type="button" className={styles.add} onClick={() => setAdding(true)}>
              <Icon name="plus" className={styles.icon} />
              {t('shell.newTransaction')}
            </button>
          </div>
        </header>

        <main className={styles.main}>
          {/* Граница загрузки — вокруг страницы, а не всего каркаса: пока
              раздел подгружается, панель и шапка остаются на месте, и
              переход не выглядит перезагрузкой. */}
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav className={styles.bar} aria-label={t('nav.aria')}>
        <Tabs tabs={BAR_START} variant="bar" />
        <button
          type="button"
          className={styles.barAdd}
          onClick={() => setAdding(true)}
          aria-label={t('shell.newTransactionAria')}
        >
          <Icon name="plus" className={styles.icon} />
        </button>
        <Tabs tabs={BAR_END} variant="bar" />
      </nav>

      {adding && <TransactionFormModal onClose={() => setAdding(false)} />}
    </div>
  );
}
