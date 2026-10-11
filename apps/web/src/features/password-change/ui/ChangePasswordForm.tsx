import { LIMITS, changePasswordSchema, type ChangePasswordInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useT } from '@/shared/i18n';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, PasswordInput } from '@/shared/ui';
import { useChangePassword } from '../api/use-change-password.ts';
import styles from './ChangePasswordForm.module.scss';

type FormValues = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const { t } = useT();
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
      {formError && <Alert>{t(formError)}</Alert>}
      {revoked !== null && (
        <Alert tone="success">
          {t('settings.passwordChanged')}
          {/* Про отозванные сессии сообщаем только когда их было что отзывать:
              «отозвано 0 сессий» — это шум, а не новость. */}
          {revoked > 0 && ` ${t('sessions.revoked', { count: revoked })}`}
        </Alert>
      )}

      <div className={styles.grid}>
        <PasswordInput
          label={t('fields.currentPassword')}
          autoComplete="current-password"
          error={t(errors.currentPassword?.message)}
          {...register('currentPassword')}
        />
        <PasswordInput
          label={t('settings.newPassword')}
          autoComplete="new-password"
          hint={t('settings.passwordHint', { count: LIMITS.passwordMin })}
          error={t(errors.newPassword?.message)}
          {...register('newPassword')}
        />
      </div>

      <Button type="submit" loading={isSubmitting}>
        {t('settings.changePassword')}
      </Button>
    </form>
  );
}
