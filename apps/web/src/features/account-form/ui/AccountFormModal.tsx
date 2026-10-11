import {
  ACCOUNT_TYPES,
  createAccountSchema,
  parseUserAmount,
  todayIn,
  toMoney,
  type AccountResponse,
  type CreateAccountInput,
} from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CurrencySelect } from '@/entities/currency';
import { useMe } from '@/entities/user';
import { useT } from '@/shared/i18n';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import { useCreateAccount, useUpdateAccount } from '../api/use-account-mutations.ts';
import styles from './AccountFormModal.module.scss';

/**
 * Сумма вводится как есть — «1 250,40» с запятой и пробелами, — и
 * приводится к каноничному виду уже при отправке. Требовать от человека
 * точку вместо запятой значит переложить на него работу, которую
 * `parseUserAmount` делает в одну строку.
 */
const formSchema = createAccountSchema.extend({ openingBalance: z.string() });
type FormValues = z.input<typeof formSchema>;

interface AccountFormModalProps {
  /** Счёт для правки. Без него форма создаёт новый. */
  account?: AccountResponse;
  onClose: () => void;
}

export function AccountFormModal({ account, onClose }: AccountFormModalProps) {
  const { t } = useT();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const { user } = useMe();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = account !== undefined;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: account?.name ?? '',
      type: account?.type ?? 'cash',
      currencyCode: account?.currencyCode ?? '',
      // Из базы приходит '1250.400000000000000000' — все 18 знаков NUMERIC.
      // toMoney убирает хвостовые нули, не трогая значимые: у счёта в BTC
      // восьмизначная дробь останется целой. Округлять по разрядности
      // валюты здесь нельзя — она может быть ещё не загружена.
      openingBalance: account ? toMoney(account.openingBalance) : '0',
      openedOn: account?.openedOn ?? todayIn(user?.timezone ?? 'UTC'),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    let openingBalance: string;
    try {
      openingBalance = parseUserAmount(values.openingBalance);
    } catch {
      setError('openingBalance', { type: 'manual', message: 'validation.money.format' });
      return;
    }

    try {
      if (isEdit) {
        // Валюта в обновление не идёт: она зафиксирована при создании.
        await update.mutateAsync({
          id: account.id,
          input: {
            name: values.name,
            type: values.type,
            openingBalance,
            openedOn: values.openedOn,
          },
        });
        toast.success(t('accounts.updated'));
      } else {
        await create.mutateAsync({ ...values, openingBalance } as CreateAccountInput);
        toast.success(t('accounts.created'));
      }
      onClose();
    } catch (error) {
      setFormError(
        applyServerError(error, setError, ['name', 'type', 'currencyCode', 'openingBalance']),
      );
    }
  });

  return (
    <Modal
      open
      title={isEdit ? t('accounts.editTitle') : t('accounts.createTitle')}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert>{t(formError)}</Alert>}

        <div className={styles.fields}>
          <Field
            label={t('accounts.name')}
            autoFocus
            error={t(errors.name?.message)}
            {...register('name')}
          />

          <Select label={t('accounts.type')} error={t(errors.type?.message)} {...register('type')}>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`accounts.type_${type}`)}
              </option>
            ))}
          </Select>

          {/* Валюту выбирают один раз: менять её задним числом — значит
              оставить историю операций под чужим заголовком. */}
          {isEdit ? (
            <Field
              label={t('fields.baseCurrency')}
              value={account.currencyCode}
              hint={t('accounts.currencyHint')}
              readOnly
              disabled
            />
          ) : (
            <CurrencySelect
              label={t('fields.baseCurrency')}
              hint={t('accounts.currencyHint')}
              error={t(errors.currencyCode?.message)}
              {...register('currencyCode')}
            />
          )}

          <Field
            label={t('accounts.openingBalance')}
            inputMode="decimal"
            hint={t('accounts.openingBalanceHint')}
            error={t(errors.openingBalance?.message)}
            {...register('openingBalance')}
          />

          {/* Дата открытия: от неё считается начальный остаток. Без неё
              он лежал бы на счёте всегда, и график показывал бы деньги
              за годы до того, как счёт появился. */}
          <Field
            label={t('accounts.openedOn')}
            type="date"
            hint={t('accounts.openedOnHint')}
            error={t(errors.openedOn?.message)}
            {...register('openedOn')}
          />
        </div>

        <Button type="submit" block loading={isSubmitting}>
          {isEdit ? t('accounts.save') : t('accounts.create')}
        </Button>
      </form>
    </Modal>
  );
}
