import { BrowserRouter, Route, Routes } from 'react-router';
import { DashboardPage } from '@/pages/dashboard';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { RegisterPage } from '@/pages/register';
import { ResetPasswordPage } from '@/pages/reset-password';
import { SessionsPage } from '@/pages/sessions';
import { SettingsPage } from '@/pages/settings';
import { VerifyEmailPage } from '@/pages/verify-email';
import { ROUTES } from '@/shared/config';
import { AppHeader } from '@/widgets/app-header';
import { OnboardingGate } from '@/widgets/onboarding-gate';
import { RedirectIfAuthenticated, RequireAuth } from './guards/route-guards.tsx';

export function Router() {
  return (
    <BrowserRouter>
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
          <Route element={<AppHeader />}>
            {/* Первичная настройка — не маршрут, а окно поверх того, куда
                человек и так попал. Отдельная страница показывала бы форму
                на пустом экране, не объясняя, ради чего отвечать. */}
            <Route element={<OnboardingGate />}>
              <Route index element={<DashboardPage />} />
              <Route path={ROUTES.sessions} element={<SessionsPage />} />
              <Route path={ROUTES.settings} element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
