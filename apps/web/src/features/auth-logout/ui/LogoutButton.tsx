import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';
import { useLogout } from '../api/use-logout.ts';

export function LogoutButton({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const logout = useLogout();

  const handleClick = async () => {
    await logout.mutateAsync().catch(() => {
      // Выход не должен застревать из-за сетевой ошибки: куки на сервере
      // всё равно будут отозваны при следующем refresh, а локально нам
      // нечего хранить.
    });
    onDone();
  };

  return (
    <Button variant="secondary" size="small" onClick={handleClick} loading={logout.isPending}>
      {t('nav.logout')}
    </Button>
  );
}
