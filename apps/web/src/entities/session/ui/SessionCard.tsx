import type { SessionSummary } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { formatDateTime, formatRelative, regionName } from '@/shared/lib';
import styles from './SessionCard.module.scss';

interface SessionCardProps {
  session: SessionSummary;
  /** Кнопка отзыва приходит снаружи: само действие живёт в features. */
  action?: ReactNode;
}

export function SessionCard({ session, action }: SessionCardProps) {
  const { t, locale } = useT();

  // Подпись устройства собирается здесь, а не берётся из session.device:
  // готовую строку сервер склеивает на одном языке, и в английском
  // интерфейсе она осталась бы «Chrome на Windows». Разобранные browser и os
  // язык не несут, поэтому склейка — дело интерфейса.
  const device =
    session.browser && session.os
      ? t('sessions.device.known', { browser: session.browser, os: session.os })
      : (session.browser ?? session.os ?? t('sessions.device.unknown'));

  // Место входа: город как есть, страна — на языке интерфейса. Любая
  // половина может отсутствовать, поэтому строка собирается из того, что есть.
  const country = session.countryCode ? regionName(session.countryCode, locale) : null;
  const place = [session.city, country].filter(Boolean).join(', ');

  return (
    <li className={styles.root}>
      <div className={styles.info}>
        <p className={styles.device}>
          {device}
          {session.isCurrent && <span className={styles.current}>{t('sessions.current')}</span>}
        </p>
        <p className={styles.meta}>
          {place && <>{place} · </>}
          {session.ip ?? t('sessions.ipUnknown')} ·{' '}
          <time dateTime={session.lastUsedAt} title={formatDateTime(session.lastUsedAt, locale)}>
            {t('sessions.activity', { when: formatRelative(session.lastUsedAt, locale) })}
          </time>
        </p>
        <p className={styles.meta}>
          {t('sessions.signedIn', { when: formatDateTime(session.createdAt, locale) })} ·{' '}
          {t('sessions.expires', { when: formatDateTime(session.expiresAt, locale) })}
        </p>
      </div>

      {action}
    </li>
  );
}
