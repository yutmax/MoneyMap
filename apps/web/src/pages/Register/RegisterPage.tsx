import { registerSchema, type RegisterInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { useCurrencies, useRegister } from '@/api/auth.ts';
import { AuthLayout } from '@/components/layout/AuthLayout/AuthLayout.tsx';
import { Alert } from '@/components/ui/Alert/Alert.tsx';
import { Button } from '@/components/ui/Button/Button.tsx';
import { Field } from '@/components/ui/Field/Field.tsx';
import { PasswordInput } from '@/components/ui/PasswordInput/PasswordInput.tsx';
import { Select } from '@/components/ui/Select/Select.tsx';
import { applyServerError } from '@/lib/forms.ts';
import styles from './RegisterPage.module.scss';

type FormValues = z.input<typeof registerSchema>;

/**
 * Базовая валюта и таймзона предзаполняются из браузера (§8.1): почти всегда
 * угадывается верно, а поправить — один выбор из списка.
 */
function guessDefaults(): { timezone: string; currency: string } {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const byRegion: Record<string, string> = {
    UA: 'UAH',
    PL: 'PLN',
    KZ: 'KZT',
    GE: 'GEL',
    TR: 'TRY',
    CZ: 'CZK',
    GB: 'GBP',
    CH: 'CHF',
    JP: 'JPY',
    US: 'USD',
  };
  const region = new Intl.Locale(resolved.locale).region ?? '';
  return {
    timezone: resolved.timeZone,
    currency: byRegion[region] ?? 'EUR',
  };
}

export function RegisterPage() {
  const navigate = useNavigate();
  const signUp = useRegister();
  const currencies = useCurrencies();
  const [formError, setFormError] = useState<string | null>(null);
  const [defaults] = useState(guessDefaults);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      name: '',
      password: '',
      baseCurrency: defaults.currency,
      timezone: defaults.timezone,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp.mutateAsync(values);
      void navigate('/', { replace: true });
    } catch (error) {
      setFormError(
        applyServerError(error, setError, [
          'email',
          'name',
          'password',
          'baseCurrency',
          'timezone',
        ]),
      );
    }
  });

  const fiat = currencies.data?.filter((c) => c.kind === 'fiat') ?? [];
  const crypto = currencies.data?.filter((c) => c.kind === 'crypto') ?? [];

  return (
    <AuthLayout
      title="Регистрация"
      subtitle="Счета в любых валютах и криптовалютах, сводный баланс в одной."
      footer={
        <>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert>{formError}</Alert>}

        <div className={styles.fields}>
          <Field
            label="Имя"
            autoComplete="name"
            autoFocus
            error={errors.name?.message}
            {...register('name')}
          />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <PasswordInput
            autoComplete="new-password"
            hint="Минимум 10 символов. Пароль проверяется по базе утечек."
            error={errors.password?.message}
            {...register('password')}
          />

          <div className={styles.row}>
            <Select
              label="Базовая валюта"
              error={errors.baseCurrency?.message}
              disabled={currencies.isPending}
              {...register('baseCurrency')}
            >
              <optgroup label="Фиат">
                {fiat.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Криптовалюты">
                {crypto.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>

            <Field
              label="Таймзона"
              error={errors.timezone?.message}
              hint="Влияет на даты регулярных операций"
              {...register('timezone')}
            />
          </div>
        </div>

        {currencies.isError && (
          <Alert tone="info">
            Справочник валют не загрузился — выбор можно поменять позже в настройках.
          </Alert>
        )}

        <Button type="submit" block loading={isSubmitting}>
          Создать аккаунт
        </Button>
      </form>
    </AuthLayout>
  );
}
