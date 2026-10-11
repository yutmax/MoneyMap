import { Link, useNavigate } from 'react-router';
import { LoginForm } from '@/features/auth-login';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-card';

export function LoginPage() {
  const { t } = useT();
  const navigate = useNavigate();

  return (
    <AuthCard
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')} <Link to={ROUTES.register}>{t('auth.login.signUp')}</Link>
        </>
      }
    >
      <LoginForm onSuccess={() => void navigate(ROUTES.home, { replace: true })} />
    </AuthCard>
  );
}
