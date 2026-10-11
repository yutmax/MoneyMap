import { useNavigate } from 'react-router';
import { useMe } from '@/entities/user';
import { OnboardingForm } from '@/features/onboarding';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-card';

export function OnboardingPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { user } = useMe();

  return (
    <AuthCard
      title={user ? t('onboarding.title', { name: user.name }) : t('onboarding.titleFallback')}
      subtitle={t('onboarding.subtitle')}
    >
      <OnboardingForm onDone={() => void navigate(ROUTES.home, { replace: true })} />
    </AuthCard>
  );
}
