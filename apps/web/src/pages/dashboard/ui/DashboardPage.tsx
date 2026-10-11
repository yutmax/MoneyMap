import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import styles from './DashboardPage.module.scss';

const CARDS = [
  { key: 'accounts', phase: 1 },
  { key: 'transactions', phase: 1 },
  { key: 'netWorth', phase: 2 },
  { key: 'recurring', phase: 3 },
  { key: 'reconciliation', phase: 4 },
  { key: 'reports', phase: 5 },
];

/**
 * Заглушка обзора. Содержимое появляется в фазе 1 (счета и транзакции) и
 * фазе 2 (сводный баланс) — здесь пока только каркас страницы и проверка того,
 * что защищённый маршрут действительно отдаёт данные пользователя.
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
