import { Link } from 'react-router';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-card';

export function NotFoundPage() {
  const { t } = useT();

  return (
    <AuthCard
      title={t('notFound.title')}
      subtitle={t('notFound.subtitle')}
      footer={<Link to={ROUTES.home}>{t('notFound.home')}</Link>}
    >
      <span />
    </AuthCard>
  );
}
