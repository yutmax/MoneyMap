import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { NotificationList } from '@/widgets/notifications';
import { TotalBalance } from '@/widgets/total-balance';
import styles from './DashboardPage.module.scss';

/**
 * Обзор. Сводный баланс (§8.6) и то, что требует внимания.
 *
 * Карточек с перечнем возможностей здесь больше нет: они были списком
 * обещаний на время, пока возможностей не было, а теперь всё это есть
 * в навигации и занимает место зря.
 */
export function DashboardPage() {
  const { t } = useT();
  const { user } = useMe();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title')}</h1>
        {/* baseCurrency и timezone здесь всегда заполнены: до онбординга
            страница недостижима (RequireOnboarded). */}
        <p className={styles.subtitle}>
          {user?.baseCurrency && user.timezone
            ? t('dashboard.subtitle', { currency: user.baseCurrency, timezone: user.timezone })
            : ''}
        </p>
      </header>

      {user && !user.emailVerified && (
        <div className={styles.notice}>
          {t('dashboard.emailNotVerified', { email: user.email })}
        </div>
      )}

      <NotificationList />

      <TotalBalance />
    </div>
  );
}
