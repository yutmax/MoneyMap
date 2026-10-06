import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useVerifyEmail } from '@/api/auth.ts';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';
import { Alert } from '@/components/ui/Alert/Alert.tsx';

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
    <AuthLayout title="Подтверждение email" footer={<Link to="/">На главную</Link>}>
      {!token && <Alert>Ссылка неполная: в ней нет токена.</Alert>}
      {token && verify.isPending && <Alert tone="info">Проверяем ссылку…</Alert>}
      {verify.isSuccess && <Alert tone="success">Email подтверждён.</Alert>}
      {verify.isError && <Alert>Ссылка недействительна или истекла.</Alert>}
    </AuthLayout>
  );
}
