import { loginSchema, type LoginInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { useLogin } from '@/api/auth.ts';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { Field } from '@/components/ui/Field/Field.tsx';
import { PasswordInput } from '@/components/ui/PasswordInput/PasswordInput.tsx';
import { applyServerError } from '@/lib/forms.ts';
import styles from './LoginPage.module.scss';

// Схема содержит .trim()/.toLowerCase(), поэтому то, что лежит в инпутах,
// и то, что уходит на сервер, — разные типы. Третий генерик useForm описывает
// именно результат после преобразования.
type FormValues = z.input<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      void navigate('/', { replace: true });
    } catch (error) {
      setFormError(applyServerError(error, setError, ['email', 'password']));
    }
  });

  return (
    <AuthLayout
      title="Вход"
      subtitle="MoneyMap помнит вас 60 дней — пароль на этом устройстве больше не понадобится."
      footer={
        <>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert>{formError}</Alert>}

        <div className={styles.fields}>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />
          <PasswordInput
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </div>

        <Button type="submit" block loading={isSubmitting}>
          Войти
        </Button>

        <Link className={styles.forgot} to="/forgot-password">
          Забыли пароль?
        </Link>
      </form>
    </AuthLayout>
  );
}
