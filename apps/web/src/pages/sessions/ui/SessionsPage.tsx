import { useNavigate } from 'react-router';
import { SessionCard, useSessions } from '@/entities/session';
import { useLogoutOthers, useRevokeSession } from '@/features/session-revoke';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { Alert, Button } from '@/shared/ui';
import styles from './SessionsPage.module.scss';

export function SessionsPage() {
  const { t } = useT();
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
          <h1 className={styles.title}>{t('sessions.title')}</h1>
          <p className={styles.subtitle}>{t('sessions.subtitle')}</p>
        </div>

        {others.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => logoutOthers.mutate()}
            loading={logoutOthers.isPending}
          >
            {t('sessions.logoutOthers', { count: others.length })}
          </Button>
        )}
      </header>

      {sessions.isError && <Alert>{t('sessions.loadFailed')}</Alert>}

      {logoutOthers.isSuccess && (
        <Alert tone="success">{t('sessions.revoked', { count: logoutOthers.data.revoked })}</Alert>
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
                  {session.isCurrent ? t('sessions.logout') : t('sessions.revoke')}
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
