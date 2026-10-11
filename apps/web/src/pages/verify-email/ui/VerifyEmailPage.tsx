import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useVerifyEmail } from '@/features/email-verify';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { Alert } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-card';

export function VerifyEmailPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useVerifyEmail();

  // StrictMode в разработке монтирует компонент дважды; без этого флага токен
  // был бы погашен первым вызовом, а второй показал бы ошибку.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  return (
    <AuthCard
      title={t('auth.verify.title')}
      footer={<Link to={ROUTES.home}>{t('auth.verify.home')}</Link>}
    >
      {!token && <Alert>{t('auth.verify.noToken')}</Alert>}
      {token && verify.isPending && <Alert tone="info">{t('auth.verify.checking')}</Alert>}
      {verify.isSuccess && <Alert tone="success">{t('auth.verify.success')}</Alert>}
      {verify.isError && <Alert>{t('auth.verify.failed')}</Alert>}
    </AuthCard>
  );
}
