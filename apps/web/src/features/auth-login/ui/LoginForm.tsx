import { loginSchema, type LoginInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { ROUTES } from '@/shared/config';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, Field, PasswordInput } from '@/shared/ui';
import { useLogin } from '../api/use-login.ts';
import styles from './LoginForm.module.scss';

// Схема содержит .trim()/.toLowerCase(), поэтому то, что лежит в инпутах,
// и то, что уходит на сервер, — разные типы. Третий генерик useForm описывает
// именно результат после преобразования.
type FormValues = z.input<typeof loginSchema>;

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
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
      onSuccess();
    } catch (error) {
      setFormError(applyServerError(error, setError, ['email', 'password']));
    }
  });

  return (
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

      <Link className={styles.forgot} to={ROUTES.forgotPassword}>
        Забыли пароль?
      </Link>
    </form>
  );
}
