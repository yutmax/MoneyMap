import type { MeResponse } from '@moneymap/shared';
import { CurrencySelect } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { Alert, Field } from '@/shared/ui';
import { useUpdateSettings } from '../api/use-update-settings.ts';
import styles from './ProfileForm.module.scss';

/**
 * Профиль сохраняется по месту: смена значения в поле — это и есть отправка.
 * Отдельная кнопка «Сохранить» здесь не нужна — каждое поле меняется
 * независимо, и подтверждать нечего.
 */
export function ProfileForm({ user }: { user: MeResponse }) {
  const { t } = useT();
  const update = useUpdateSettings();

  return (
    <>
      <div className={styles.grid}>
        <Field
          label={t('fields.name')}
          defaultValue={user.name}
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name && name !== user.name) update.mutate({ name });
          }}
        />

        <CurrencySelect
          value={user.baseCurrency ?? ''}
          onChange={(e) => update.mutate({ baseCurrency: e.currentTarget.value })}
        />

        <Field
          label={t('fields.timezone')}
          defaultValue={user.timezone ?? ''}
          hint={t('settings.timezoneHint')}
          onBlur={(e) => {
            const timezone = e.currentTarget.value.trim();
            if (timezone && timezone !== user.timezone) update.mutate({ timezone });
          }}
        />
      </div>

      <p className={styles.note}>{t('settings.currencyNote')}</p>

      {update.isError && <Alert>{t('settings.saveFailed')}</Alert>}
      {update.isSuccess && <Alert tone="success">{t('settings.saved')}</Alert>}
    </>
  );
}
