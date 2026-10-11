import { Link } from 'react-router';
import { ForgotPasswordForm } from '@/features/password-reset';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-card';

export function ForgotPasswordPage() {
  const { t } = useT();

  return (
    <AuthCard
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={<Link to={ROUTES.login}>{t('auth.forgot.back')}</Link>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
