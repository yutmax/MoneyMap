import { Toaster as Sonner } from 'sonner';
import { Icon } from '../Icon/Icon.tsx';
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
      // Класс на контейнере переопределяет собственные переменные sonner.
      // Этого требует крестик: его красит правило вида
      // [data-sonner-theme="dark"] … [data-close-button], которое `unstyled`
      // не снимает, а перебить одним классом нельзя — специфичность выше.
      // Подменить значение переменной проще, чем воевать за вес селектора.
      className={styles.toaster}
      icons={{
        // Свои значки вместо залитых глифов sonner: у тех другая толщина
        // и заливка, и рядом с обведёнными lucide они выглядели чужими.
        success: <Icon name="circle-check" className={styles.glyph} />,
        error: <Icon name="circle-alert" className={styles.glyph} />,
        warning: <Icon name="circle-alert" className={styles.glyph} />,
        info: <Icon name="info" className={styles.glyph} />,
        close: <Icon name="x" className={styles.closeGlyph} />,
      }}
      toastOptions={{
        // unstyled снимает с тоста оформление самого sonner, оставляя
        // позиционирование, стопку и анимацию.
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
          warning: styles.warning,
          info: styles.info,
        },
      }}
    />
  );
}
