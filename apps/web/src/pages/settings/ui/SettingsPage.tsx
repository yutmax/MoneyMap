import { useMe } from '@/entities/user';
import { LocaleSwitch } from '@/features/locale-switch';
import { ChangePasswordForm } from '@/features/password-change';
import { ProfileForm } from '@/features/profile-update';
import { ReminderSettings } from '@/features/reconciliation';
import { ThemeToggle } from '@/features/theme-switch';
import { useT } from '@/shared/i18n';
import styles from './SettingsPage.module.scss';

export function SettingsPage() {
  const { t } = useT();
  const { user } = useMe();

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      {user && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('settings.profile')}</h2>
          <ProfileForm user={user} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.appearance')}</h2>

        {/* Язык и тема хранятся в браузере, а не в профиле: это свойство
            устройства, а не человека. Телефон в тёмной теме и рабочий
            компьютер в светлой — обычное дело, и одно значение на аккаунт
            переписывало бы одно другим. Поэтому здесь нет кнопки
            «сохранить» — выбор применяется сразу. */}
        <dl className={styles.options}>
          <dt className={styles.optionLabel}>{t('settings.language')}</dt>
          <dd className={styles.optionControl}>
            <LocaleSwitch />
          </dd>

          <dt className={styles.optionLabel}>{t('settings.theme')}</dt>
          <dd className={styles.optionControl}>
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
    </div>
  );
}
