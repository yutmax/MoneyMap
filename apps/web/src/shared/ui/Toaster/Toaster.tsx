import { Toaster as Sonner } from 'sonner';
import styles from './Toaster.module.scss';

/**
 * Всплывающие уведомления.
 *
 * Цвета тоста берутся из наших токенов и следуют за `data-theme` на <html>
 * сами. Проп темы нужен не им, а внутренностям sonner, которые мы не
 * переопределяем: сам он читает только `prefers-color-scheme`, а у нас выбор
 * темы — это ещё и явные «светлая/тёмная» поверх системной.
 *
 * Своя реализация здесь не окупилась бы: у тоста есть незаметная, но
 * обязательная часть — объявление скринридеру, пауза таймера при наведении
 * и фокусе, уважение к prefers-reduced-motion, стопка и очередь. Это тот
 * случай, когда зависимость дешевле собственного кода.
 */
export function Toaster({ theme }: { theme: 'light' | 'dark' | 'system' }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      gap={8}
      toastOptions={{
        // unstyled снимает с тоста оформление самого sonner, оставляя
        // позиционирование, стопку и анимацию. Без него пришлось бы
        // перебивать его правила специфичностью: селекторы у нас и у него
        // одного веса, а его стили подключаются позже наших и выигрывают
        // по порядку.
        unstyled: true,
        classNames: {
          toast: styles.toast,
          content: styles.content,
          title: styles.title,
          description: styles.description,
          icon: styles.icon,
          closeButton: styles.close,
          success: styles.success,
          error: styles.error,
          info: styles.info,
        },
      }}
    />
  );
}
