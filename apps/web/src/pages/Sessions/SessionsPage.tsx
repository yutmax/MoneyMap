import type { SessionSummary } from '@moneymap/shared';
import { useNavigate } from 'react-router';
import { useLogoutOthers, useRevokeSession, useSessions } from '@/api/auth.ts';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { formatDateTime, formatRelative } from '@/lib/format.ts';
import styles from './SessionsPage.module.scss';

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: SessionSummary;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  return (
    <li className={styles.item}>
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

      <Button variant="danger" size="small" onClick={() => onRevoke(session.id)} loading={revoking}>
        {session.isCurrent ? 'Выйти' : 'Отозвать'}
      </Button>
    </li>
  );
}

export function SessionsPage() {
  const navigate = useNavigate();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOthers();

  const handleRevoke = async (id: string) => {
    const result = await revoke.mutateAsync(id).catch(() => null);
    // Отзыв собственной сессии — это выход: оставаться на защищённой странице
    // уже нельзя.
    if (result?.wasCurrent) void navigate('/login', { replace: true });
  };

  const others = (sessions.data ?? []).filter((s) => !s.isCurrent);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Активные устройства</h1>
          <p className={styles.subtitle}>
            Сессия живёт 60 дней и продлевается при использовании. Отозванное устройство теряет
            доступ сразу, не дожидаясь истечения токена.
          </p>
        </div>

        {others.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => logoutOthers.mutate()}
            loading={logoutOthers.isPending}
          >
            Выйти на остальных ({others.length})
          </Button>
        )}
      </header>

      {sessions.isError && <Alert>Не удалось загрузить список устройств.</Alert>}

      {logoutOthers.isSuccess && (
        <Alert tone="success">Отозвано сессий: {logoutOthers.data.revoked}.</Alert>
      )}

      {sessions.isPending ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {(sessions.data ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={revoke.isPending && revoke.variables === session.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
