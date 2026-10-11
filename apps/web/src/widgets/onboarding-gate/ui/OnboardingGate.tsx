import { Outlet } from 'react-router';
import { isOnboarded, useMe } from '@/entities/user';
import { OnboardingModal } from '@/features/onboarding';

/**
 * Пускает в приложение и, если первичная настройка не пройдена, показывает
 * её поверх.
 *
 * Окно, а не отдельный маршрут: приложение под ним видно, и два вопроса
 * читаются как «осталось настроить», а не как продолжение регистрации.
 * Пропустить шаг нельзя не запретом на переходы, а самим модальным окном —
 * `showModal()` делает остальную страницу недоступной и для мыши,
 * и для клавиатуры, и для скринридера.
 */
export function OnboardingGate() {
  const { user } = useMe();

  return (
    <>
      <Outlet />
      {user && !isOnboarded(user) && <OnboardingModal name={user.name} />}
    </>
  );
}
