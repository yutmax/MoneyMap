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
import { cx } from '@/shared/lib';
import styles from './ProfilePage.module.scss';

/**
 * Профиль: всё, что относится к учётной записи, а не к деньгам.
 *
 * Сюда же уехали разделы, которым не нашлось места в нижней панели —
 * категории и устройства. Они открываются раз в несколько месяцев, и
 * занимать ими одну из пяти вкладок значило бы отодвинуть то, чем
 * пользуются каждый день.
 */
const LINKS = [
  { to: ROUTES.categories, key: 'nav.categories' },
  { to: ROUTES.sessions, key: 'nav.devices' },
];

export function ProfilePage() {
  const { t } = useT();
  const { user } = useMe();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      {/* Имя и почта, а не заголовок страницы: раздел называется «Профиль»,
          и это написано в верхней строке. Здесь — кто именно вошёл. */}
      <header className={styles.header}>
        <p className={styles.name}>{user?.name ?? t('nav.profile')}</p>
        {user && <p className={styles.email}>{user.email}</p>}
      </header>

      <nav className={styles.links}>
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={styles.link}>
            {t(link.key)}
          </Link>
        ))}
      </nav>

      {user && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('settings.profile')}</h2>
          <ProfileForm user={user} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.appearance')}</h2>

        {/* Язык и тема хранятся в браузере, а не в профиле: это свойство
            устройства, а не человека. Поэтому здесь нет кнопки «сохранить» —
            выбор применяется сразу. */}
        <dl className={styles.options}>
          <dt className={styles.optionLabel}>{t('settings.language')}</dt>
          <dd className={styles.optionControl}>
            <LocaleSwitch />
          </dd>

          {/* На широком экране переключатель темы стоит внизу боковой панели,
              и здесь он был бы вторым таким же на одном экране. На телефоне
              панели нет, и это единственное его место. */}
          <dt className={cx(styles.optionLabel, styles.narrowOnly)}>{t('settings.theme')}</dt>
          <dd className={cx(styles.optionControl, styles.narrowOnly)}>
            <ThemeToggle />
          </dd>
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('reminders.title')}</h2>
        <ReminderSettings />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.password')}</h2>
        <ChangePasswordForm />
      </section>

      {/* Выход внизу профиля, а не в шапке: он нужен редко, а место в шапке
          занимал постоянно. */}
      <div className={styles.logout}>
        <LogoutButton onDone={() => void navigate(ROUTES.login, { replace: true })} />
      </div>
    </div>
  );
}
