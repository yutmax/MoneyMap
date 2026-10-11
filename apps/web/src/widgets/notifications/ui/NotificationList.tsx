import { Link } from 'react-router';
import { useNotifications } from '@/entities/reconciliation';
import { useMarkNotificationRead } from '@/features/reconciliation';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatDate } from '@/shared/lib';
import { Button } from '@/shared/ui';
import styles from './NotificationList.module.scss';

/**
 * Непрочитанные уведомления на главной (§8.8).
 *
 * Не колокольчик со счётчиком: уведомление здесь пока одно — напоминание
 * о сверке раз в месяц, — и ради него прятать сообщение за иконкой значит
 * сделать так, чтобы его не увидели. Станет видов больше — станет список.
 */
export function NotificationList() {
  const { t, locale } = useT();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();

  const unread = (notifications.data ?? []).filter((n) => n.readAt === null);
  if (unread.length === 0) return null;

  return (
    <ul className={styles.root}>
      {unread.map((notification) => (
        <li key={notification.id} className={styles.item}>
          <div className={styles.text}>
            <p className={styles.title}>{t(`notifications.${notification.kind}.title`)}</p>
            <p className={styles.body}>
              {t(`notifications.${notification.kind}.body`, {
                when: formatDate(String(notification.payload.asOf ?? ''), locale),
              })}
            </p>
          </div>

          <div className={styles.actions}>
            <Link className={styles.link} to={ROUTES.reconciliation}>
              {t('notifications.open')}
            </Link>
            <Button
              variant="secondary"
              size="small"
              onClick={() => markRead.mutate(notification.id)}
            >
              {t('notifications.dismiss')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
