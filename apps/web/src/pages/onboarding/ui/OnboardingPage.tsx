import { useNavigate } from 'react-router';
import { useMe } from '@/entities/user';
import { OnboardingForm } from '@/features/onboarding';
import { ROUTES } from '@/shared/config';
import { AuthCard } from '@/widgets/auth-card';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useMe();

  return (
    <AuthCard
      title={user ? `${user.name}, ещё два поля` : 'Ещё два поля'}
      subtitle="Без них приложение не знает, в какой валюте сводить итог и по какому календарю считать даты."
    >
      <OnboardingForm onDone={() => void navigate(ROUTES.home, { replace: true })} />
    </AuthCard>
  );
}
