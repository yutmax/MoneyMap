import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout/AppLayout.tsx';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage.tsx';
import { ForgotPasswordPage } from '@/pages/ForgotPassword/ForgotPasswordPage.tsx';
import { LoginPage } from '@/pages/Login/LoginPage.tsx';
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage.tsx';
import { RegisterPage } from '@/pages/Register/RegisterPage.tsx';
import { ResetPasswordPage } from '@/pages/ResetPassword/ResetPasswordPage.tsx';
import { SessionsPage } from '@/pages/Sessions/SessionsPage.tsx';
import { SettingsPage } from '@/pages/Settings/SettingsPage.tsx';
import { VerifyEmailPage } from '@/pages/VerifyEmail/VerifyEmailPage.tsx';
import { RedirectIfAuthenticated, RequireAuth } from './guards.tsx';
import { Providers } from './providers.tsx';

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          {/* Публичные страницы, доступные и вошедшему: подтверждение email
              приходит по ссылке из письма в любой момент. */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<RedirectIfAuthenticated />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
