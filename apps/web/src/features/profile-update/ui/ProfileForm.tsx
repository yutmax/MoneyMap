import type { MeResponse, UpdateSettingsInput } from '@moneymap/shared';
import { CurrencySelect } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { Field, TimezoneSelect, toast } from '@/shared/ui';
import { useUpdateSettings } from '../api/use-update-settings.ts';
import styles from './ProfileForm.module.scss';

/**
 * Профиль сохраняется по месту: смена значения в поле — это и есть отправка.
 * Отдельная кнопка «Сохранить» здесь не нужна — каждое поле меняется
 * независимо, и подтверждать нечего.
 *
 * Результат показывается уведомлением, а не строкой под формой: сохранение
 * срабатывает по уходу из поля, и к этому моменту человек смотрит уже
 * на другое место страницы.
 */
export function ProfileForm({ user }: { user: MeResponse }) {
  const { t } = useT();
  const update = useUpdateSettings();

  const save = (input: UpdateSettingsInput) => {
    update.mutate(input, {
      onSuccess: () => toast.success(t('settings.saved')),
      onError: () => toast.error(t('settings.saveFailed')),
    });
  };

  return (
    <>
      <div className={styles.grid}>
        <Field
          label={t('fields.name')}
          defaultValue={user.name}
          onBlur={(e) => {
            const name = e.currentTarget.value.trim();
            if (name && name !== user.name) save({ name });
          }}
        />

        <CurrencySelect
          value={user.baseCurrency ?? ''}
          onChange={(e) => save({ baseCurrency: e.currentTarget.value })}
        />

        <TimezoneSelect
          value={user.timezone ?? ''}
          hint={t('settings.timezoneHint')}
          onChange={(e) => save({ timezone: e.currentTarget.value })}
        />
      </div>

      <p className={styles.note}>{t('settings.currencyNote')}</p>
    </>
  );
}
