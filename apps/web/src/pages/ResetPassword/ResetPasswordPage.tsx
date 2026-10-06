import { passwordSchema } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useResetPassword } from '@/api/auth.ts';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { PasswordInput } from '@/components/ui/PasswordInput/PasswordInput.tsx';
import { applyServerError } from '@/lib/forms.ts';
import styles from './ResetPasswordPage.module.scss';

// Подтверждение пароля — требование формы, не API: на сервере второе поле
// не нужно, поэтому схема живёт здесь, а не в packages/shared.
const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Пароли не совпадают',
    path: ['confirm'],
  });

type FormValues = z.input<typeof formSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token, password });
    } catch (error) {
      setFormError(applyServerError(error, setError, ['password']));
    }
  });

  if (!token) {
    return (
      <AuthLayout
        title="Сброс пароля"
        footer={<Link to="/forgot-password">Запросить новую ссылку</Link>}
      >
        <Alert>Ссылка неполная: в ней нет токена.</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Новый пароль"
      subtitle="После смены все сессии на всех устройствах будут отозваны."
      footer={<Link to="/login">Перейти к входу</Link>}
    >
      {reset.isSuccess ? (
        <Alert tone="success">Пароль изменён. Войдите с новым паролем.</Alert>
      ) : (
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {formError && <Alert>{formError}</Alert>}
          <PasswordInput
            label="Новый пароль"
            autoComplete="new-password"
            autoFocus
            hint="Минимум 10 символов"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordInput
            label="Повторите пароль"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          <Button type="submit" block loading={isSubmitting}>
            Сменить пароль
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
