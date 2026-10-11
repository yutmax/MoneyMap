import { LIMITS, registerSchema, type RegisterInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useT } from '@/shared/i18n';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, Field, PasswordInput } from '@/shared/ui';
import { useRegister } from '../api/use-register.ts';
import styles from './RegisterForm.module.scss';

type FormValues = z.input<typeof registerSchema>;

/**
 * Форма спрашивает только имя, email и пароль.
 *
 * Базовая валюта и таймзона переехали в онбординг: на регистрации они требуют
 * решения от человека, который ещё не открывал приложение и не знает, на что
 * эти параметры влияют, а каждое лишнее поле на входе — это те, кто не дошёл
 * до конца формы.
 */
export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useT();
  const signUp = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', name: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp.mutateAsync(values);
      onSuccess();
    } catch (error) {
      setFormError(applyServerError(error, setError, ['email', 'name', 'password']));
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert>{t(formError)}</Alert>}

      <div className={styles.fields}>
        <Field
          label={t('fields.name')}
          autoComplete="name"
          autoFocus
          error={t(errors.name?.message)}
          {...register('name')}
        />
        <Field
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          error={t(errors.email?.message)}
          {...register('email')}
        />
        <PasswordInput
          autoComplete="new-password"
          hint={t('auth.register.passwordHint', { count: LIMITS.passwordMin })}
          error={t(errors.password?.message)}
          {...register('password')}
        />
      </div>

      <Button type="submit" block loading={isSubmitting}>
        {t('auth.register.submit')}
      </Button>
    </form>
  );
}
