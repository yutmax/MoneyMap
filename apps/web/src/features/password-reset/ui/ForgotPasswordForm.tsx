import { forgotPasswordSchema } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, Button, Field } from '@/shared/ui';
import { useForgotPassword } from '../api/use-password-reset.ts';
import styles from './ForgotPasswordForm.module.scss';

type FormValues = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
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
  if (forgot.isSuccess) {
    return (
      <Alert tone="success">
        Если адрес зарегистрирован, письмо уже отправлено. Проверьте почту.
      </Alert>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" block loading={isSubmitting}>
        Отправить ссылку
      </Button>
    </form>
  );
}
