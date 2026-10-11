import { Link, useNavigate } from 'react-router';
import { RegisterForm } from '@/features/auth-register';
import { ROUTES } from '@/shared/config';
import { AuthCard } from '@/widgets/auth-card';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <AuthCard
      title="Регистрация"
      subtitle="Счета в любых валютах и криптовалютах, сводный баланс в одной."
      footer={
        <>
          Уже есть аккаунт? <Link to={ROUTES.login}>Войти</Link>
        </>
      }
    >
      {/* Настройки спросим после входа: см. ROUTES.onboarding. */}
      <RegisterForm onSuccess={() => void navigate(ROUTES.onboarding, { replace: true })} />
    </AuthCard>
  );
}
