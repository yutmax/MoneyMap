import type { SessionSummary } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { formatDateTime, formatRelative } from '@/shared/lib';
import styles from './SessionCard.module.scss';

interface SessionCardProps {
  session: SessionSummary;
  /** Кнопка отзыва приходит снаружи: само действие живёт в features. */
  action?: ReactNode;
}

export function SessionCard({ session, action }: SessionCardProps) {
  return (
    <li className={styles.root}>
      <div className={styles.info}>
        <p className={styles.device}>
          {session.device}
          {session.isCurrent && <span className={styles.current}>это устройство</span>}
        </p>
        <p className={styles.meta}>
          {session.ip ?? 'IP неизвестен'} · активность{' '}
          <time dateTime={session.lastUsedAt} title={formatDateTime(session.lastUsedAt)}>
            {formatRelative(session.lastUsedAt)}
          </time>
        </p>
        <p className={styles.meta}>
          вход {formatDateTime(session.createdAt)} · истекает {formatDateTime(session.expiresAt)}
        </p>
      </div>

      {action}
    </li>
  );
}
