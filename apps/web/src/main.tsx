import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
// Побочный импорт: инициализирует i18next до первой отрисовки, иначе
// первый кадр успевает уйти на языке по умолчанию.
import './shared/i18n';
// Единственный глобальный импорт стилей на весь проект: reset, токены,
// базовая типографика. Всё остальное приходит вместе со своим компонентом
// как *.module.scss.
import './app/styles/global.scss';

const container = document.getElementById('root');
if (!container) throw new Error('В index.html нет #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Регистрация service worker — только в собранном приложении.
 *
 * Воркер ничего не кеширует (см. public/sw.js), он нужен Chrome, чтобы
 * считать сайт устанавливаемым: без него «добавить на главный экран» даёт
 * ярлык внутри браузера, а не отдельное приложение.
 *
 * В dev не регистрируется намеренно: установленный однажды воркер живёт
 * в браузере дольше вкладки, и отлаживать его присутствие на localhost —
 * лишний источник «почему это не обновилось».
 *
 * Регистрация после load: в момент первой отрисовки сеть нужнее приложению.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      // Самая частая причина — незащищённый контекст: по IP с самоподписанным
      // сертификатом браузер воркеры не разрешает. Приложение работает и без
      // него, поэтому это сообщение, а не ошибка.
      console.info('Service worker не зарегистрирован:', error);
    });
  });
}
