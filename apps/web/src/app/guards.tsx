import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/api/auth.ts';
import styles from './guards.module.scss';

function Loading() {
  return (
    // role="status" + aria-live: скринридер сообщит о загрузке, не выдёргивая
    // фокус из текущего места.
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className="visually-hidden">Загрузка</span>
    </div>
  );
}

/** Защищённая область приложения. */
export function RequireAuth() {
  const { user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) return <Loading />;
  // state.from — чтобы после входа вернуть человека туда, куда он шёл.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
}

/** Страницы входа и регистрации: вошедшему там делать нечего. */
export function RedirectIfAuthenticated() {
  const { user, isLoading } = useMe();

  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/" replace />;

  return <Outlet />;
}
