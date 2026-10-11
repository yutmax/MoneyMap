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
 * Перенесён из прототипа. Содержательное отличие — кнопка переключения
 * описана для скринридера и не является частью таб-порядка формы по
 * случайности: aria-pressed сообщает текущее состояние, а не только действие.
 */
export function PasswordInput({ label, error, hint, ...inputProps }: PasswordInputProps) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  return (
    <Field
      {...inputProps}
      type={visible ? 'text' : 'password'}
      label={label ?? t('fields.password')}
      error={error}
      hint={hint}
      labelAside={
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} className={styles.icon} />
          {visible ? t('fields.hidePassword') : t('fields.showPassword')}
        </button>
      }
    />
  );
}
