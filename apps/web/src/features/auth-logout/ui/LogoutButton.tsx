import { Button } from '@/shared/ui';
import { useLogout } from '../api/use-logout.ts';

export function LogoutButton({ onDone }: { onDone: () => void }) {
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
      Выйти
    </Button>
  );
}
