import { useNavigate } from 'react-router';
import { SessionCard, useSessions } from '@/entities/session';
import { useLogoutOthers, useRevokeSession } from '@/features/session-revoke';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { Alert, Button, toast } from '@/shared/ui';
import styles from './SessionsPage.module.scss';

export function SessionsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logoutOthers = useLogoutOthers();

  const handleRevoke = async (id: string) => {
    const result = await revoke.mutateAsync(id).catch(() => null);

    if (!result) {
      toast.error(t('sessions.revokeFailed'));
      return;
    }

    // Отзыв собственной сессии — это выход: оставаться на защищённой странице
    // уже нельзя, и уведомление показывать некому.
    if (result.wasCurrent) {
      void navigate(ROUTES.login, { replace: true });
      return;
    }

    toast.success(t('sessions.revoked', { count: 1 }));
  };

  const handleLogoutOthers = () => {
    logoutOthers.mutate(undefined, {
      onSuccess: (result) => toast.success(t('sessions.revoked', { count: result.revoked })),
      onError: () => toast.error(t('sessions.revokeFailed')),
    });
  };

  const others = (sessions.data ?? []).filter((s) => !s.isCurrent);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.subtitle}>{t('sessions.subtitle')}</p>
        </div>

        {others.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={handleLogoutOthers}
            loading={logoutOthers.isPending}
          >
            {t('sessions.logoutOthers', { count: others.length })}
          </Button>
        )}
      </header>

      {/* Ошибка загрузки остаётся на месте списка: она объясняет, почему
          список пуст, и обязана висеть, пока это так. Результат отзыва,
          наоборот, разовый — он уходит в уведомление. */}
      {sessions.isError && <Alert>{t('sessions.loadFailed')}</Alert>}

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
