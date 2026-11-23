import { useEffect, useState } from 'react';
import { Spinner } from '../Spinner/Spinner.tsx';

/**
 * Заглушка, пока грузится файл страницы.
 *
 * Показывается не сразу, а через 250 мс: из кеша или по быстрой сети раздел
 * приезжает быстрее, и мелькнувший на долю секунды спиннер выглядит
 * дёрганьем, а не загрузкой. Ждать дольше — значит дать понять, что идёт.
 */
export function PageFallback({ fullscreen = false }: { fullscreen?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(timer);
  }, []);

  return visible ? <Spinner fullscreen={fullscreen} /> : null;
}
