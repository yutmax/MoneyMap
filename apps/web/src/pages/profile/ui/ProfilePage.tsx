import { Link, useNavigate } from 'react-router';
import { useMe } from '@/entities/user';
import { LogoutButton } from '@/features/auth-logout';
import { LocaleSwitch } from '@/features/locale-switch';
import { ChangePasswordForm } from '@/features/password-change';
import { ProfileForm } from '@/features/profile-update';
import { ReminderSettings } from '@/features/reconciliation';
import { ThemeToggle } from '@/features/theme-switch';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { Icon, type IconName } from '@/shared/ui';
import styles from './ProfilePage.module.scss';

/**
 * Разделы, которым не нашлось места в нижней панели. Они открываются раз в
 * несколько месяцев, и занимать ими одну из пяти вкладок значило бы
 * отодвинуть то, чем пользуются каждый день.
 */
const LINKS: Array<{ to: string; key: string; hint: string; icon: IconName }> = [
  {
    to: ROUTES.categories,
    key: 'nav.categories',
    hint: 'settings.categoriesHint',
    icon: 'tags',
  },
  { to: ROUTES.sessions, key: 'nav.devices', hint: 'settings.devicesHint', icon: 'devices' },
];

/** Инициалы для кружка: две первые буквы слов имени, или одна, если слово одно. */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

/**
 * Профиль: всё, что относится к учётной записи и приложению, а не к деньгам.
 *
 * Сверху — кто вошёл и выход. Ниже на широком экране две колонки: слева то,
 * что заполняют (профиль и пароль), справа то, что переключают (язык, тема,
 * напоминание) и куда переходят (категории, устройства). Раньше всё это шло
 * одной узкой стопкой карточек у левого края, а переходы выглядели
 * случайными кнопками над ней.
 */
export function ProfilePage() {
  const { t } = useT();
  const { user } = useMe();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <header className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(user?.name ?? '')}
        </span>
        <div className={styles.who}>
          <p className={styles.name}>{user?.name ?? t('nav.profile')}</p>
          {user && <p className={styles.email}>{user.email}</p>}
          {user?.emailVerified === false && (
            <Link to={ROUTES.notifications} className={styles.unverified}>
              <Icon name="mail-warning" className={styles.unverifiedIcon} />
              {t('settings.emailUnverified')}
            </Link>
          )}
        </div>
        {/* Выход здесь, рядом с тем, кто вошёл, а не последней строкой
            длинной страницы. */}
        <div className={styles.logout}>
          <LogoutButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.column}>
          {user && (
            <section className={styles.section} aria-labelledby="profile-title">
              <h2 className={styles.sectionTitle} id="profile-title">
                {t('settings.profile')}
              </h2>
              <ProfileForm user={user} />
            </section>
          )}

          <section className={styles.section} aria-labelledby="password-title">
            <h2 className={styles.sectionTitle} id="password-title">
              {t('settings.password')}
            </h2>
            <ChangePasswordForm />
          </section>
        </div>

        <div className={styles.column}>
          {/* Язык и тема хранятся в браузере, а не в профиле: это свойство
              устройства, а не человека. Поэтому кнопки «сохранить» нет —
              выбор применяется сразу. Тема здесь стоит и на широком экране:
              в настройках её ищут, даже когда она есть в боковой панели. */}
          <section className={styles.section} aria-labelledby="app-title">
            <h2 className={styles.sectionTitle} id="app-title">
              {t('settings.app')}
            </h2>
            <ul className={styles.rows}>
              <li className={styles.row}>
                <span className={styles.rowIcon}>
                  <Icon name="languages" className={styles.glyph} />
                </span>
                <span className={styles.rowLabel}>{t('settings.language')}</span>
                <LocaleSwitch />
              </li>
              <li className={styles.row}>
                <span className={styles.rowIcon}>
                  <Icon name="palette" className={styles.glyph} />
                </span>
                <span className={styles.rowLabel}>{t('settings.theme')}</span>
                <ThemeToggle />
              </li>
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="sections-title">
            <h2 className={styles.sectionTitle} id="sections-title">
              {t('settings.sections')}
            </h2>
            <ul className={styles.rows}>
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={styles.linkRow}>
                    <span className={styles.rowIcon}>
                      <Icon name={link.icon} className={styles.glyph} />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowLabel}>{t(link.key)}</span>
                      <span className={styles.rowHint}>{t(link.hint)}</span>
                    </span>
                    <Icon name="chevron-right" className={styles.chevron} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="reminder-title">
            <h2 className={styles.sectionTitle} id="reminder-title">
              {t('reminders.title')}
            </h2>
            <ReminderSettings />
          </section>
        </div>
      </div>
    </div>
  );
}
