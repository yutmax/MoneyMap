import { changePasswordSchema, type ChangePasswordInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChangePassword, useCurrencies, useMe, useUpdateSettings } from '@/api/auth.ts';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { Field } from '@/components/ui/Field/Field.tsx';
import { PasswordInput } from '@/components/ui/PasswordInput/PasswordInput.tsx';
import { Select } from '@/components/ui/Select/Select.tsx';
import { applyServerError } from '@/lib/forms.ts';
import styles from './SettingsPage.module.scss';

type PasswordFormValues = z.input<typeof changePasswordSchema>;

function ProfileSection() {
  const { user } = useMe();
  const currencies = useCurrencies();
  const update = useUpdateSettings();

  if (!user) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Профиль</h2>

      <div className={styles.grid}>
        <Field
          label="Имя"
          defaultValue={user.name}
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name && name !== user.name) update.mutate({ name });
          }}
        />

        <Select
          label="Базовая валюта"
          value={user.baseCurrency}
          disabled={currencies.isPending}
          onChange={(e) => update.mutate({ baseCurrency: e.currentTarget.value })}
        >
          {(currencies.data ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      </div>

      <p className={styles.note}>
        Смена базовой валюты меняет только отображение сводного баланса. Валюты счетов и
        зафиксированные в операциях курсы не пересчитываются.
      </p>

      {update.isError && <Alert>Не удалось сохранить изменения.</Alert>}
      {update.isSuccess && <Alert tone="success">Сохранено.</Alert>}
    </section>
  );
}

function PasswordSection() {
  const changePassword = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues, unknown, ChangePasswordInput>({
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
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Пароль</h2>

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
            hint="Минимум 10 символов"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
        </div>

        <Button type="submit" loading={isSubmitting}>
          Сменить пароль
        </Button>
      </form>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Настройки</h1>
      <ProfileSection />
      <PasswordSection />
    </div>
  );
}
