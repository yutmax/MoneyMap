import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/entities/user';
import { ROUTES } from '@/shared/config';
import { Spinner } from '@/shared/ui';

/** Защищённая область приложения. */
export function RequireAuth() {
  const { user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) return <Spinner fullscreen />;
  // state.from — чтобы после входа вернуть человека туда, куда он шёл.
  if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;

  return <Outlet />;
}

/** Страницы входа и регистрации: вошедшему там делать нечего. */
export function RedirectIfAuthenticated() {
  const { user, isLoading } = useMe();

  if (isLoading) return <Spinner fullscreen />;
  if (user) return <Navigate to={ROUTES.home} replace />;

  return <Outlet />;
}
