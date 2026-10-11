import { useMe } from '@/entities/user';
import { ChangePasswordForm } from '@/features/password-change';
import { ProfileForm } from '@/features/profile-update';
import styles from './SettingsPage.module.scss';

export function SettingsPage() {
  const { user } = useMe();

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Настройки</h1>

      {user && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Профиль</h2>
          <ProfileForm user={user} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Пароль</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
