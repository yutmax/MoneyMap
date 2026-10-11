import { useNavigate } from 'react-router';
import { SessionCard, useSessions } from '@/entities/session';
import { useLogoutOthers, useRevokeSession } from '@/features/session-revoke';
import { ROUTES } from '@/shared/config';
import { Alert, Button } from '@/shared/ui';
import styles from './SessionsPage.module.scss';

export function SessionsPage() {
  const navigate = useNavigate();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOthers();

  const handleRevoke = async (id: string) => {
    const result = await revoke.mutateAsync(id).catch(() => null);
    // Отзыв собственной сессии — это выход: оставаться на защищённой странице
    // уже нельзя.
    if (result?.wasCurrent) void navigate(ROUTES.login, { replace: true });
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
            <SessionCard
              key={session.id}
              session={session}
              action={
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => handleRevoke(session.id)}
                  loading={revoke.isPending && revoke.variables === session.id}
                >
                  {session.isCurrent ? 'Выйти' : 'Отозвать'}
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
