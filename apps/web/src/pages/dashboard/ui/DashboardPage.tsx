import { RecentTransactions } from '@/widgets/recent-transactions';
import { TotalBalance } from '@/widgets/total-balance';
import styles from './DashboardPage.module.scss';

/**
 * Обзор. Сводный баланс (§8.6) и то, что требует внимания.
 *
 * Карточек с перечнем возможностей здесь больше нет: они были списком
 * обещаний на время, пока возможностей не было, а теперь всё это есть
 * в навигации и занимает место зря.
 *
 * Баннера о неподтверждённом email здесь тоже нет. Он висел над балансом
 * каждый день, хотя сказать ему было нечего нового, и отодвигал вниз то,
 * ради чего на страницу заходят. Теперь это уведомление — его видно по
 * счётчику у колокольчика, а прочитать можно, когда дойдут руки.
 */
export function DashboardPage() {
  return (
    <div className={styles.root}>
      <TotalBalance />

      <RecentTransactions />
    </div>
  );
}
