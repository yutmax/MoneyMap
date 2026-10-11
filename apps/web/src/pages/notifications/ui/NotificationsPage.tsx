import { useNotifications } from '@/entities/reconciliation';
import { useMarkNotificationRead } from '@/features/reconciliation';
import { useT } from '@/shared/i18n';
import { cx, formatDateTime } from '@/shared/lib';
import { Button, Spinner } from '@/shared/ui';
import styles from './NotificationsPage.module.scss';

/**
 * Уведомления (§8.8).
 *
 * Отдельная страница за колокольчиком, а не блок на главной: главная —
 * про деньги, а сообщение о том, что пора свериться, приходит раз в месяц
 * и не должно каждый день занимать первый экран.
 */
export function NotificationsPage() {
  const { t, locale } = useT();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();

  const list = notifications.data ?? [];

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{t('notifications.title')}</h1>

      {notifications.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className={styles.empty}>{t('notifications.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((item) => (
            <li key={item.id} className={cx(styles.item, item.readAt === null && styles.unread)}>
              <div className={styles.text}>
                <p className={styles.name}>{t(`notifications.${item.kind}.title`)}</p>
                <p className={styles.body}>
                  {t(`notifications.${item.kind}.body`, {
                    when: String(item.payload.asOf ?? ''),
                  })}
                </p>
                <p className={styles.when}>{formatDateTime(item.createdAt, locale)}</p>
              </div>

              {item.readAt === null && (
                <Button variant="secondary" size="small" onClick={() => markRead.mutate(item.id)}>
                  {t('notifications.dismiss')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
