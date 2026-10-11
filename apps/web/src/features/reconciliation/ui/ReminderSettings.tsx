import { REMINDER_CHANNELS, type ReminderChannel } from '@moneymap/shared';
import { useReminders } from '@/entities/reconciliation';
import { useT } from '@/shared/i18n';
import { Field, Select, Spinner, toast } from '@/shared/ui';
import { useUpdateReminder } from '../api/use-reconciliation-mutations.ts';
import styles from './ReminderSettings.module.scss';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Настройка напоминания о сверке (§8.8).
 *
 * Без кнопки «сохранить»: каждое поле — отдельное решение, и ждать
 * подтверждения, чтобы включить напоминание, незачем. Ошибка отката не
 * делает — она честно говорит, что не сохранилось.
 */
export function ReminderSettings() {
  const { t } = useT();
  const reminders = useReminders();
  const update = useUpdateReminder();

  const reminder = reminders.data?.find((r) => r.kind === 'balance_check');
  if (reminders.isPending) return <Spinner />;
  if (!reminder) return null;

  const save = (input: Parameters<typeof update.mutate>[0]['input']) => {
    update.mutate(
      { id: reminder.id, input },
      { onError: () => toast.error(t('settings.saveFailed')) },
    );
  };

  const toggleChannel = (channel: ReminderChannel, on: boolean) => {
    const next = on
      ? [...reminder.channels, channel]
      : reminder.channels.filter((c) => c !== channel);
    // Снять последний канал нельзя: напоминание без канала — это
    // выключенное напоминание, и выключать его надо выключателем.
    if (next.length === 0) {
      toast.error(t('reminders.channelRequired'));
      return;
    }
    save({ channels: next });
  };

  return (
    <div className={styles.root}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={reminder.isEnabled}
          onChange={(e) => save({ isEnabled: e.currentTarget.checked })}
        />
        <span>
          {t('reminders.enable')}
          <span className={styles.hint}>{t('reminders.enableHint')}</span>
        </span>
      </label>

      {reminder.isEnabled && (
        <div className={styles.fields}>
          <Select
            label={t('reminders.day')}
            value={reminder.useLastDay ? 'last' : String(reminder.dayOfMonth)}
            onChange={(e) =>
              e.currentTarget.value === 'last'
                ? save({ useLastDay: true })
                : save({ useLastDay: false, dayOfMonth: Number(e.currentTarget.value) })
            }
          >
            <option value="last">{t('reminders.lastDay')}</option>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {t('recurring.onDay', { day })}
              </option>
            ))}
          </Select>

          <Field
            label={t('reminders.time')}
            type="time"
            value={reminder.timeOfDay}
            hint={t('reminders.timeHint')}
            onChange={(e) => e.currentTarget.value && save({ timeOfDay: e.currentTarget.value })}
          />

          <fieldset className={styles.channels}>
            <legend className={styles.legend}>{t('reminders.channels')}</legend>
            {REMINDER_CHANNELS.map((channel) => (
              <label key={channel} className={styles.channel}>
                <input
                  type="checkbox"
                  checked={reminder.channels.includes(channel)}
                  onChange={(e) => toggleChannel(channel, e.currentTarget.checked)}
                />
                <span>{t(`reminders.channel.${channel}`)}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
