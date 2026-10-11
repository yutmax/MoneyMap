import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useSearchParams } from 'react-router';
import { useVerifyEmail } from '@/features/email-verify';
import { ROUTES } from '@/shared/config';
import { Alert } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-card';

export function VerifyEmailPage() {
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
    <AuthCard title="Подтверждение email" footer={<Link to={ROUTES.home}>На главную</Link>}>
      {!token && <Alert>Ссылка неполная: в ней нет токена.</Alert>}
      {token && verify.isPending && <Alert tone="info">Проверяем ссылку…</Alert>}
      {verify.isSuccess && <Alert tone="success">Email подтверждён.</Alert>}
      {verify.isError && <Alert>Ссылка недействительна или истекла.</Alert>}
    </AuthCard>
  );
}
