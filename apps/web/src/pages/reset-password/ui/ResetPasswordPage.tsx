import { Link, useSearchParams } from 'react-router';
import { ResetPasswordForm } from '@/features/password-reset';
import { ROUTES } from '@/shared/config';
import { Alert } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-card';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  if (!token) {
    return (
      <AuthCard
        title="Сброс пароля"
        footer={<Link to={ROUTES.forgotPassword}>Запросить новую ссылку</Link>}
      >
        <Alert>Ссылка неполная: в ней нет токена.</Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Новый пароль"
      subtitle="После смены все сессии на всех устройствах будут отозваны."
      footer={<Link to={ROUTES.login}>Перейти к входу</Link>}
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
