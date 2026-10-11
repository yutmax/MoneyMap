import { onboardingSchema, type OnboardingInput } from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { CurrencySelect } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, TimezoneSelect } from '@/shared/ui';
import { useCompleteOnboarding } from '../api/use-complete-onboarding.ts';
import { guessDefaults } from '../lib/guess-defaults.ts';
import styles from './OnboardingForm.module.scss';

type FormValues = z.input<typeof onboardingSchema>;

/**
 * Форма ничего не делает после успеха и не принимает колбэка: ответ сервера
 * кладётся в кеш пользователя, onboardedAt перестаёт быть пустым, и окно
 * пропадает само — тем же условием, которым появилось.
 */
export function OnboardingForm() {
  const { t } = useT();
  const complete = useCompleteOnboarding();
  const [formError, setFormError] = useState<string | null>(null);
  const [defaults] = useState(guessDefaults);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { baseCurrency: defaults.currency, timezone: defaults.timezone },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await complete.mutateAsync(values);
    } catch (error) {
      setFormError(applyServerError(error, setError, ['baseCurrency', 'timezone']));
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert>{t(formError)}</Alert>}

      <div className={styles.fields}>
        <CurrencySelect
          error={t(errors.baseCurrency?.message)}
          hint={t('onboarding.currencyHint')}
          {...register('baseCurrency')}
        />

        {/* Controller, а не register: список таймзон собирается в useMemo,
            и неуправляемый select выставлял бы значение раньше, чем
            появляются его option — браузер сбрасывал бы выбор на первый. */}
        <Controller
          control={control}
          name="timezone"
          render={({ field }) => (
            <TimezoneSelect
              {...field}
              hint={t('onboarding.timezoneHint')}
              error={t(errors.timezone?.message)}
            />
          )}
        />
      </div>

      <p className={styles.note}>{t('onboarding.note')}</p>

      <Button type="submit" block loading={isSubmitting}>
        {t('onboarding.submit')}
      </Button>
    </form>
  );
}
