import { Link } from 'react-router';
import { ROUTES } from '@/shared/config';
import { AuthCard } from '@/widgets/auth-card';

export function NotFoundPage() {
  return (
    <AuthCard
      title="404"
      subtitle="Такой страницы нет."
      footer={<Link to={ROUTES.home}>Вернуться на главную</Link>}
    >
      <span />
    </AuthCard>
  );
}
