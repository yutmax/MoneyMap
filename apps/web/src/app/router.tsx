import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { ROUTES } from '@/shared/config';
import { PageFallback } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';
import { OnboardingGate } from '@/widgets/onboarding-gate';
import { RedirectIfAuthenticated, RequireAuth } from './guards/route-guards.tsx';

/**
 * Страницы грузятся по требованию, каждая своим файлом.
 *
 * Раньше весь код всех разделов приезжал одним файлом при первом открытии,
 * хотя человеку в этот момент нужен один экран. Теперь основной файл —
 * каркас, роутер и общие библиотеки, а раздел подтягивается при переходе
 * в него. Вместе с разделом уезжает и то, что нужно только ему: формы
 * (react-hook-form) — только страницам с формами, схемы zod — только тем,
 * кто ими проверяет.
 */
type Loader = () => Promise<Record<string, unknown>>;

function page(load: Loader, name: string) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const loaders = {
  dashboard: () => import('@/pages/dashboard'),
  transactions: () => import('@/pages/transactions'),
  accounts: () => import('@/pages/accounts'),
  reports: () => import('@/pages/reports'),
  profile: () => import('@/pages/profile'),
} satisfies Record<string, Loader>;

const DashboardPage = page(loaders.dashboard, 'DashboardPage');
const TransactionsPage = page(loaders.transactions, 'TransactionsPage');
const AccountsPage = page(loaders.accounts, 'AccountsPage');
const ReportsPage = page(loaders.reports, 'ReportsPage');
const ProfilePage = page(loaders.profile, 'ProfilePage');
const CategoriesPage = page(() => import('@/pages/categories'), 'CategoriesPage');
const RecurringPage = page(() => import('@/pages/recurring'), 'RecurringPage');
const ReconciliationPage = page(() => import('@/pages/reconciliation'), 'ReconciliationPage');
const ConverterPage = page(() => import('@/pages/converter'), 'ConverterPage');
const SessionsPage = page(() => import('@/pages/sessions'), 'SessionsPage');
const NotificationsPage = page(() => import('@/pages/notifications'), 'NotificationsPage');
const LoginPage = page(() => import('@/pages/login'), 'LoginPage');
const RegisterPage = page(() => import('@/pages/register'), 'RegisterPage');
const ForgotPasswordPage = page(() => import('@/pages/forgot-password'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('@/pages/reset-password'), 'ResetPasswordPage');
const VerifyEmailPage = page(() => import('@/pages/verify-email'), 'VerifyEmailPage');
const NotFoundPage = page(() => import('@/pages/not-found'), 'NotFoundPage');

/**
 * Разделы из нижней панели подтягиваются заранее, когда браузеру нечем
 * заняться: первый переход в «Операции» не должен ждать сети, раз мы знаем,
 * что туда пойдут. Повторный import() того же модуля ничего не качает —
 * браузер вернёт уже загруженный.
 */
function PrefetchSections() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}));
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 2000);
    return () => clearTimeout(timer);
  }, []);
  return <Outlet />;
}

export function Router() {
  return (
    <BrowserRouter>
      {/* Граница для страниц вне каркаса — вход, регистрация, письма. Внутри
          каркаса своя граница вокруг области страницы (AppShell): там панель
          и шапка остаются на месте, пока раздел подгружается. */}
      <Suspense fallback={<PageFallback fullscreen />}>
        <Routes>
          {/* Публичные страницы, доступные и вошедшему: подтверждение email
              приходит по ссылке из письма в любой момент. */}
          <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />

          <Route element={<RedirectIfAuthenticated />}>
            <Route path={ROUTES.login} element={<LoginPage />} />
            <Route path={ROUTES.register} element={<RegisterPage />} />
            <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              {/* Первичная настройка — не маршрут, а окно поверх того, куда
                  человек и так попал. Отдельная страница показывала бы форму
                  на пустом экране, не объясняя, ради чего отвечать. */}
              <Route element={<OnboardingGate />}>
                <Route element={<PrefetchSections />}>
                  <Route index element={<DashboardPage />} />
                  <Route path={ROUTES.accounts} element={<AccountsPage />} />
                  <Route path={ROUTES.transactions} element={<TransactionsPage />} />
                  <Route path={ROUTES.categories} element={<CategoriesPage />} />
                  <Route path={ROUTES.recurring} element={<RecurringPage />} />
                  <Route path={ROUTES.reconciliation} element={<ReconciliationPage />} />
                  <Route path={ROUTES.reports} element={<ReportsPage />} />
                  <Route path={ROUTES.converter} element={<ConverterPage />} />
                  <Route path={ROUTES.sessions} element={<SessionsPage />} />
                  <Route path={ROUTES.profile} element={<ProfilePage />} />
                  <Route path={ROUTES.notifications} element={<NotificationsPage />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
