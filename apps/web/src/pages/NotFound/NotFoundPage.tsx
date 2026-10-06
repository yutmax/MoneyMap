import { Link } from 'react-router';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';

export function NotFoundPage() {
  return (
    <AuthLayout
      title="404"
      subtitle="Такой страницы нет."
      footer={<Link to="/">Вернуться на главную</Link>}
    >
      <span />
    </AuthLayout>
  );
}
