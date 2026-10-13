import { useT } from '@/shared/i18n';
import { Icon } from '@/shared/ui';
import { useLogout } from '../api/use-logout.ts';
import styles from './LogoutIconButton.module.scss';

/**
 * Выход одним значком — для верхней строки на широком экране.
 *
 * Отдельный компонент, а не проп у `LogoutButton`: там кнопка с подписью
 * внизу страницы профиля, где выход — осознанный пункт списка действий,
 * здесь — значок в углу, который должен занимать ровно столько же места,
 * сколько колокольчик рядом. Общего у них только запрос, он и вынесен в хук.
 *
 * Подпись скрыта, но есть: кнопка без текста безымянна для скринридера.
 */
export function LogoutIconButton({ onDone }: { onDone: () => void }) {
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
    <button
      type="button"
      className={styles.root}
      onClick={handleClick}
      disabled={logout.isPending}
      aria-busy={logout.isPending || undefined}
      title={t('nav.logout')}
    >
      <Icon name="log-out" className={styles.icon} />
      <span className="visually-hidden">{t('nav.logout')}</span>
    </button>
  );
}
