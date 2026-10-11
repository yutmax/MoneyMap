import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { NotificationList } from '@/widgets/notifications';
import { TotalBalance } from '@/widgets/total-balance';
import styles from './DashboardPage.module.scss';

const CARDS = [
  { key: 'accounts', phase: 1 },
  { key: 'transactions', phase: 1 },
  { key: 'recurring', phase: 3 },
  { key: 'reconciliation', phase: 4 },
  { key: 'reports', phase: 5 },
];

/**
 * Обзор. Сводный баланс (§8.6) — первое, что видно на странице; карточки под
 * ним перечисляют то, чего ещё нет, и уходят по мере готовности фаз.
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

      <div className={styles.cards}>
        {CARDS.map((card) => (
          <article key={card.key} className={styles.card}>
            <h2 className={styles.cardTitle}>{t(`dashboard.cards.${card.key}.title`)}</h2>
            <p className={styles.cardText}>{t(`dashboard.cards.${card.key}.text`)}</p>
            <span className={styles.badge}>{t('dashboard.phase', { number: card.phase })}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
