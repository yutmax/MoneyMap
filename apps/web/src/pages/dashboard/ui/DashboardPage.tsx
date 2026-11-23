import { AccountsOverview } from '@/widgets/accounts-overview';
import { MonthTiles, TopSpending } from '@/widgets/month-overview';
import { RecentTransactions } from '@/widgets/recent-transactions';
import { TotalBalance } from '@/widgets/total-balance';
import styles from './DashboardPage.module.scss';

/**
 * Обзор: сколько всего, как идёт месяц, где деньги и что было недавно.
 *
 * Раньше здесь были только итог и пять операций, и на широком экране
 * половина страницы пустовала, а за ответом «сколько я потратил в этом
 * месяце» надо было идти в отчёты. Теперь главная собрана из четырёх
 * ответов, по убыванию того, как часто их ищут: итог с графиком, три
 * числа за месяц, лента слева, счета и главные траты справа.
 *
 * Баннера о неподтверждённом email здесь нет: это уведомление у
 * колокольчика, читать его можно, когда дойдут руки.
 */
export function DashboardPage() {
  return (
    <div className={styles.root}>
      <TotalBalance />
      <MonthTiles />

      <div className={styles.columns}>
        <RecentTransactions />
        <aside className={styles.side}>
          <AccountsOverview />
          <TopSpending />
        </aside>
      </div>
    </div>
  );
}
