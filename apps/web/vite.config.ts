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
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
