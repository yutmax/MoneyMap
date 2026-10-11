import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.scss';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /**
   * Закрытие по Esc и клику по фону. Без него окно не закрыть никак —
   * это для шагов, которые нельзя пропустить.
   */
  onClose?: () => void;
}

/**
 * Модальное окно на нативном `<dialog>`.
 *
 * Своя реализация поверх div потребовала бы руками написать ловушку фокуса,
 * возврат фокуса на то, что открыло окно, inert для остальной страницы и
 * обработку Esc. `showModal()` делает всё это сам и делает правильно —
 * включая top layer, который не зависит от z-index родителей.
 */
export function Modal({ open, title, subtitle, children, onClose }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismissible = onClose !== undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `cancel` — это Esc. У недиалогового окна его надо погасить: без этого
    // шаг, который нельзя пропустить, пропускается одной клавишей.
    const onCancel = (event: Event) => {
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onClose?.();
    };

    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="modal-title"
      // Клик по фону попадает в сам <dialog>: содержимое лежит во вложенном
      // блоке, поэтому сравнение с target отличает фон от карточки.
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose?.();
      }}
    >
      <div className={styles.card}>
        <header className={styles.header}>
          <h2 className={styles.title} id="modal-title">
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>

        {children}
      </div>
    </dialog>
  );
}
