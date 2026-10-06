import { forgotPasswordSchema } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useForgotPassword } from '@/api/auth.ts';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { Field } from '@/components/ui/Field/Field.tsx';
import styles from './ForgotPasswordPage.module.scss';

type FormValues = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
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

  return (
    <AuthLayout
      title="Сброс пароля"
      subtitle="Пришлём ссылку на смену пароля. Она одноразовая и действует час."
      footer={<Link to="/login">Вернуться к входу</Link>}
    >
      {/* Ответ одинаков независимо от того, есть такой адрес или нет: иначе
          эндпоинт превращается в проверялку зарегистрированных email. */}
      {forgot.isSuccess ? (
        <Alert tone="success">
          Если адрес зарегистрирован, письмо уже отправлено. Проверьте почту.
        </Alert>
      ) : (
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
      )}
    </AuthLayout>
  );
}
