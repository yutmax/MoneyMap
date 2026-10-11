import { Link, useSearchParams } from 'react-router';
import { ResetPasswordForm } from '@/features/password-reset';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { Alert } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-card';

export function ResetPasswordPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  if (!token) {
    return (
      <AuthCard
        title={t('auth.forgot.title')}
        footer={<Link to={ROUTES.forgotPassword}>{t('auth.reset.requestNew')}</Link>}
      >
        <Alert>{t('auth.reset.noToken')}</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.reset.title')}
      subtitle={t('auth.reset.subtitle')}
      footer={<Link to={ROUTES.login}>{t('auth.reset.toLogin')}</Link>}
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
