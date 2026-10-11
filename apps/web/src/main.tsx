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
