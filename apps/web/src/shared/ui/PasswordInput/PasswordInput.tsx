import { useState, type ComponentPropsWithRef } from 'react';
import { useT } from '@/shared/i18n';
import { Field } from '../Field/Field.tsx';
import styles from './PasswordInput.module.scss';

interface PasswordInputProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'className' | 'id' | 'type'
> {
  label?: string;
  error?: string | undefined;
  hint?: string | undefined;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.6" />
      {!open && <path d="M4 20 20 4" strokeLinecap="round" />}
    </svg>
  );
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
          <EyeIcon open={visible} />
          {visible ? t('fields.hidePassword') : t('fields.showPassword')}
        </button>
      }
    />
  );
}
