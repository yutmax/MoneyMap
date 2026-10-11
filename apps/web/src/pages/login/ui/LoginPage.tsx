import { Link, useNavigate } from 'react-router';
import { LoginForm } from '@/features/auth-login';
import { ROUTES } from '@/shared/config';
import { AuthCard } from '@/widgets/auth-card';

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <AuthCard
      title="Вход"
      subtitle="MoneyMap помнит вас 60 дней — пароль на этом устройстве больше не понадобится."
      footer={
        <>
          Нет аккаунта? <Link to={ROUTES.register}>Зарегистрироваться</Link>
        </>
      }
    >
      <LoginForm onSuccess={() => void navigate(ROUTES.home, { replace: true })} />
    </AuthCard>
  );
}
