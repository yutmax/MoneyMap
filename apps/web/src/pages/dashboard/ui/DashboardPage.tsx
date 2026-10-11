import { useMe } from '@/entities/user';
import styles from './DashboardPage.module.scss';

const CARDS = [
  { title: 'Счета', phase: 'фаза 1', text: 'Наличные, карты, вклады, криптокошельки.' },
  {
    title: 'Операции',
    phase: 'фаза 1',
    text: 'Доходы, расходы и переводы между своими счетами.',
  },
  { title: 'Сводный баланс', phase: 'фаза 2', text: 'Всё состояние в одной выбранной валюте.' },
  { title: 'Регулярные списания', phase: 'фаза 3', text: 'Подписки и платежи создаются сами.' },
  { title: 'Сверка остатков', phase: 'фаза 4', text: 'Расхождение между фактом и расчётом.' },
  { title: 'Отчёты', phase: 'фаза 5', text: 'Расходы по категориям, кэшфлоу, net worth.' },
];

/**
 * Заглушка обзора. Содержимое появляется в фазе 1 (счета и транзакции) и
 * фазе 2 (сводный баланс) — здесь пока только каркас страницы и проверка того,
 * что защищённый маршрут действительно отдаёт данные пользователя.
 */
export function DashboardPage() {
  const { user } = useMe();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>Обзор</h1>
        {/* baseCurrency и timezone здесь всегда заполнены: до онбординга
            страница недостижима (RequireOnboarded). */}
        <p className={styles.subtitle}>
          {user ? `Базовая валюта — ${user.baseCurrency}, таймзона — ${user.timezone}.` : ''}
        </p>
      </header>

      {user && !user.emailVerified && (
        <div className={styles.notice}>
          Email не подтверждён. Ссылка отправлена на {user.email} — в разработке она печатается в
          лог API.
        </div>
      )}

      <div className={styles.cards}>
        {CARDS.map((card) => (
          <article key={card.title} className={styles.card}>
            <h2 className={styles.cardTitle}>{card.title}</h2>
            <p className={styles.cardText}>{card.text}</p>
            <span className={styles.badge}>{card.phase}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
