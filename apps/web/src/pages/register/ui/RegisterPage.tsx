import { Link, useNavigate } from 'react-router';
import { RegisterForm } from '@/features/auth-register';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-card';

export function RegisterPage() {
  const { t } = useT();
  const navigate = useNavigate();

  return (
    <AuthCard
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Link to={ROUTES.login}>{t('auth.register.signIn')}</Link>
        </>
      }
    >
      {/* Настройки спросим после входа: см. ROUTES.onboarding. */}
      <RegisterForm onSuccess={() => void navigate(ROUTES.onboarding, { replace: true })} />
    </AuthCard>
  );
}
