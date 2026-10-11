/**
 * Пути приложения в одном месте.
 *
 * Роутер, гарды и ссылки обязаны говорить об одном маршруте одной строкой:
 * опечатка в литерале внутри <Navigate> не ломает сборку и проявляется
 * только переходом на 404.
 */
export const ROUTES = {
  home: '/',
  accounts: '/accounts',
  transactions: '/transactions',
  categories: '/categories',
  recurring: '/recurring',
  login: '/login',
  register: '/register',
  sessions: '/sessions',
  settings: '/settings',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
} as const;
