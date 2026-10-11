import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
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
