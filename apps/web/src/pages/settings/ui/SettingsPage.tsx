import { useMe } from '@/entities/user';
import { ChangePasswordForm } from '@/features/password-change';
import { ProfileForm } from '@/features/profile-update';
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
        <h2 className={styles.sectionTitle}>{t('settings.password')}</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
