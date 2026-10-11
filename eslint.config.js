import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // .vite — кеш пребандленных зависимостей: чужой сгенерированный код,
    // на который линтер выдаёт тысячи замечаний не по адресу.
    ignores: ['**/dist/**', '**/build/**', '**/drizzle/**', '**/node_modules/**', '**/.vite/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Денежные значения — строки, и приведение к number должно быть заметным.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'BinaryExpression[operator=/^[*/]$/] > Identifier[name=/[Aa]mount|[Bb]alance/]',
          message: 'Денежная арифметика — только через @moneymap/shared/money, не оператором.',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  // Фронтенд
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Границы слоёв Feature-Sliced Design.
  //
  // Слой импортирует только то, что лежит строго ниже него:
  //   app → pages → widgets → features → entities → shared
  //
  // Правило держится на no-restricted-imports, а не на отдельном плагине:
  // запретов ровно пять строк, а плагин — это зависимость, которую придётся
  // обновлять ради списка, помещающегося на экран. Проверяется только
  // направление между слоями; импорт соседнего слайса в обход его index.ts
  // ловится код-ревью.
  ...[
    ['app', []],
    ['pages', ['app']],
    ['widgets', ['app', 'pages']],
    ['features', ['app', 'pages', 'widgets']],
    ['entities', ['app', 'pages', 'widgets', 'features']],
    ['shared', ['app', 'pages', 'widgets', 'features', 'entities']],
  ].map(([layer, forbidden]) => ({
    files: [`apps/web/src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: forbidden.map((upper) => ({
            group: [`@/${upper}`, `@/${upper}/*`],
            message: `Слой ${layer} не может зависеть от ${upper}: импорты идут только вниз по слоям FSD.`,
          })),
        },
      ],
    },
  })),

  // Service worker: своё глобальное окружение — ни window, ни document,
  // зато self, clients и события установки.
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },

  // Сборочные скрипты вне src: исполняются Node напрямую.
  {
    files: ['**/scripts/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Бэкенд
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
