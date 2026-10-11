import type { MeResponse } from '@moneymap/shared';
import { CurrencySelect } from '@/entities/currency';
import { Alert, Field } from '@/shared/ui';
import { useUpdateSettings } from '../api/use-update-settings.ts';
import styles from './ProfileForm.module.scss';

/**
 * Профиль сохраняется по месту: смена значения в поле — это и есть отправка.
 * Отдельная кнопка «Сохранить» здесь не нужна — каждое поле меняется
 * независимо, и подтверждать нечего.
 */
export function ProfileForm({ user }: { user: MeResponse }) {
  const update = useUpdateSettings();

  return (
    <>
      <div className={styles.grid}>
        <Field
          label="Имя"
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
          label="Таймзона"
          defaultValue={user.timezone ?? ''}
          hint="Влияет на даты регулярных операций"
          onBlur={(e) => {
            const timezone = e.currentTarget.value.trim();
            if (timezone && timezone !== user.timezone) update.mutate({ timezone });
          }}
        />
      </div>

      <p className={styles.note}>
        Смена базовой валюты меняет только отображение сводного баланса. Валюты счетов и
        зафиксированные в операциях курсы не пересчитываются.
      </p>

      {update.isError && <Alert>Не удалось сохранить изменения.</Alert>}
      {update.isSuccess && <Alert tone="success">Сохранено.</Alert>}
    </>
  );
}
