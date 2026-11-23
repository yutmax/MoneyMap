import { AccountsOverview } from '@/widgets/accounts-overview';
import { MonthCard, WhereMoneyWent } from '@/widgets/month-overview';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { TotalBalance } from '@/widgets/total-balance';
import { UpcomingPayments } from '@/widgets/upcoming-payments';
import styles from './DashboardPage.module.scss';

/**
 * Главная: сколько всего, как идёт месяц, где деньги, что было и что будет.
 *
 * Порядок — по убыванию того, как часто ответ ищут. Первая строка — итог с
 * графиком и карточка месяца рядом с ним: это два числа, ради которых
 * приложение открывают. Под ними карточки счетов, затем операции слева и
 * справа — на что ушли деньги и что спишется дальше.
 *
 * Баннера о неподтверждённом email здесь нет: это уведомление у
 * колокольчика, читать его можно, когда дойдут руки.
 */
export function DashboardPage() {
  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <TotalBalance />
        <MonthCard />
      </div>

      <AccountsOverview />

      <div className={styles.columns}>
        <RecentTransactions />
        <aside className={styles.side}>
          <WhereMoneyWent />
          <UpcomingPayments />
        </aside>
      </div>
    </div>
  );
}
