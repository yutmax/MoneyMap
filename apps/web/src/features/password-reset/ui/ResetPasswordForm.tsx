import { passwordSchema } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, PasswordInput } from '@/shared/ui';
import { useResetPassword } from '../api/use-password-reset.ts';
import styles from './ResetPasswordForm.module.scss';

// Подтверждение пароля — требование формы, не API: на сервере второе поле
// не нужно, поэтому схема живёт здесь, а не в packages/shared.
const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Пароли не совпадают',
    path: ['confirm'],
  });

type FormValues = z.input<typeof formSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
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

  if (reset.isSuccess) {
    return <Alert tone="success">Пароль изменён. Войдите с новым паролем.</Alert>;
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert>{formError}</Alert>}
      <PasswordInput
        label="Новый пароль"
        autoComplete="new-password"
        autoFocus
        hint="Минимум 8 символов"
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
  );
}
