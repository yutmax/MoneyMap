import { changePasswordSchema, type ChangePasswordInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, PasswordInput } from '@/shared/ui';
import { useChangePassword } from '../api/use-change-password.ts';
import styles from './ChangePasswordForm.module.scss';

type FormValues = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setRevoked(null);
    try {
      const result = await changePassword.mutateAsync(values);
      setRevoked(result.revokedSessions);
      reset();
    } catch (error) {
      setFormError(applyServerError(error, setError, ['currentPassword', 'newPassword']));
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert>{formError}</Alert>}
      {revoked !== null && (
        <Alert tone="success">Пароль изменён. Отозвано других сессий: {revoked}.</Alert>
      )}

      <div className={styles.grid}>
        <PasswordInput
          label="Текущий пароль"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <PasswordInput
          label="Новый пароль"
          autoComplete="new-password"
          hint="Минимум 8 символов"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
      </div>

      <Button type="submit" loading={isSubmitting}>
        Сменить пароль
      </Button>
    </form>
  );
}
