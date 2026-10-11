import { forgotPasswordSchema } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useT } from '@/shared/i18n';
import { Alert, Button, Field } from '@/shared/ui';
import { useForgotPassword } from '../api/use-password-reset.ts';
import styles from './ForgotPasswordForm.module.scss';

type FormValues = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const { t } = useT();
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, z.output<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    await forgot.mutateAsync(email).catch(() => null);
  });

  // Ответ одинаков независимо от того, есть такой адрес или нет: иначе
  // эндпоинт превращается в проверялку зарегистрированных email.
  if (forgot.isSuccess) return <Alert tone="success">{t('auth.forgot.sent')}</Alert>;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field
        label={t('fields.email')}
        type="email"
        autoComplete="email"
        autoFocus
        error={t(errors.email?.message)}
        {...register('email')}
      />
      <Button type="submit" block loading={isSubmitting}>
        {t('auth.forgot.submit')}
      </Button>
    </form>
  );
}
