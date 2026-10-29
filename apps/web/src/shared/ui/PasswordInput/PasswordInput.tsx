import { useState, type ComponentPropsWithRef } from 'react';
import { useT } from '@/shared/i18n';
import { Field } from '../Field/Field.tsx';
import { Icon } from '../Icon/Icon.tsx';
import styles from './PasswordInput.module.scss';

interface PasswordInputProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'id' | 'type'
> {
  label?: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * Поле пароля с глазом внутри, у правого края — как в любом привычном
 * поле такого рода.
 *
 * Кнопка без текста, поэтому название у неё в aria-label, а состояние —
 * в aria-pressed: скринридер слышит и действие, и то, включено ли оно.
 */
export function PasswordInput({ label, error, hint, ...inputProps }: PasswordInputProps) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? t('fields.hidePassword') : t('fields.showPassword');

  return (
    <Field
      {...inputProps}
      type={visible ? 'text' : 'password'}
      label={label ?? t('fields.password')}
      error={error}
      hint={hint}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} className={styles.icon} />
        </button>
      }
    />
  );
}
