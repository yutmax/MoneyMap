import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const stylesPath = fileURLToPath(new URL('./src/shared/styles', import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': srcPath },
  },

  css: {
    preprocessorOptions: {
      scss: {
        // Новый API dart-sass. На старом (`legacy`) Vite печатает предупреждение
        // об устаревании и не умеет параллелить компиляцию.
        api: 'modern-compiler',

        // Фасад системы стилей подмешивается в каждый .scss, который Vite
        // обрабатывает. Без этого в начале каждого модуля пришлось бы писать
        // `@use "../../styles" as *;` с относительным путём, который ломается
        // при переносе компонента в другую папку.
        //
        // Безопасно только потому, что styles/_index.scss не печатает CSS:
        // иначе токены и reset продублировались бы в каждом модуле.
        additionalData: '@use "index" as *;\n',

        // loadPaths вместо alias: alias Vite разрешает для JS-импортов,
        // а `@use` разбирает сам Sass, и ему нужен путь поиска.
        loadPaths: [stylesPath],
      },
    },

    modules: {
      // В dev-сборке имя класса читаемо в DevTools, в prod — короткий хеш.
      generateScopedName:
        process.env.NODE_ENV === 'production'
          ? '[hash:base64:6]'
          : '[name]__[local]__[hash:base64:4]',
      // styles.passLabel вместо styles['pass-label'].
      localsConvention: 'camelCaseOnly',
    },
  },

  server: {
    port: 5173,
    // Без strictPort Vite молча переезжает на 5174, если 5173 занят
    // недобитым процессом с прошлого запуска. Приложение при этом
    // открывается, но origin перестаёт совпадать с WEB_ORIGIN, и каждый
    // POST падает на проверке CSRF — ошибка выглядит как баг в коде.
    strictPort: true,
    proxy: {
      // Путь /api сохраняется один в один: от него зависит область действия
      // refresh-куки (path=/api/auth/refresh), и в dev он должен совпадать
      // с тем, что отдаёт Caddy в проде.
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: false,
      },
    },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    // Статику раздаёт Caddy напрямую (§4.3), отдельного Node-процесса нет.
    outDir: 'dist',
    rollupOptions: {
      output: {
        /*
         * Библиотеки — отдельными файлами от нашего кода.
         *
         * Хеш в имени файла меняется, только когда меняется содержимое, а
         * кешируются такие файлы на год (Caddyfile). Наш код меняется каждый
         * деплой, библиотеки — раз в несколько месяцев: лежи они вместе,
         * каждый деплой заставлял бы заново качать и React. Отдельно они
         * остаются в кеше браузера, и после выката приезжает только своё.
         *
         * Функция, а не список имён: список ловил `react-dom`, но не
         * `react-dom/client`, и React DOM — треть всего веса — оставался в
         * основном файле.
         *
         * В общий файл библиотек — только явный список того, без чего не
         * отрисовать первый экран: переводы, деньги, значки, уведомления.
         * Сначала туда шло «всё остальное из node_modules», и вместе с ним —
         * зависимости графиков (redux, immer, es-toolkit…), которые нужны
         * только главной и отчётам, а грузились каждому на каждом экране.
         * Всё, что не в списке, Rollup раскладывает сам — туда, где оно
         * используется.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[/\\](react|react-dom|react-router|scheduler)[/\\]/.test(id)) return 'react';
          if (/[/\\]@tanstack[/\\]/.test(id)) return 'query';
          if (
            /[/\\](i18next|react-i18next|i18next-browser-languagedetector|sonner|decimal\.js|lucide-react)[/\\]/.test(
              id,
            )
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
