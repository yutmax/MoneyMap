import { Link } from 'react-router';
import { ForgotPasswordForm } from '@/features/password-reset';
import { ROUTES } from '@/shared/config';
import { AuthCard } from '@/widgets/auth-card';

export function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Сброс пароля"
      subtitle="Пришлём ссылку на смену пароля. Она одноразовая и действует час."
      footer={<Link to={ROUTES.login}>Вернуться к входу</Link>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
