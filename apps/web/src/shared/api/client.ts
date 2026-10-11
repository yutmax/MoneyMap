import { ERROR_CODES, isApiErrorBody, type ApiErrorDetail } from '@moneymap/shared';
import { i18n } from '../i18n/config.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Сообщение для конкретного поля формы — чтобы разложить details по инпутам. */
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

const CSRF_COOKIE = 'mm_csrf';

function readCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Пустое тело или не-JSON — например, 502 от прокси.
  }

  if (isApiErrorBody(body)) {
    return new ApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details ?? [],
    );
  }

  // Сюда попадаем, только если ответ пришёл не от нашего API (прокси, обрыв):
  // своих сообщений в нём нет, поэтому ключ подставляем сами.
  return new ApiError(
    response.status,
    response.status === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.INTERNAL_ERROR,
    response.status >= 500 ? 'errors.serverUnavailable' : 'errors.requestFailed',
  );
}

/* ──────────────────────────── обновление сессии ─────────────────────────── */

/**
 * Один общий промис на все параллельные попытки обновить сессию.
 *
 * Без этого три одновременных запроса, получивших 401, вызвали бы три refresh
 * подряд. Первый повернул бы токен, а второй и третий предъявили бы уже
 * использованный — то есть сервер увидел бы ровно картину кражи токена
 * и отозвал сессию. На сервере от этого есть защита (окно 10 секунд),
 * но полагаться на неё вместо того, чтобы не создавать гонку, неправильно.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { ...csrfHeaders(), ...localeHeaders() },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { 'x-csrf-token': token } : {};
}

/**
 * Язык интерфейса уходит на сервер с каждым запросом: сообщения об ошибках
 * собираются там (lib/errors.ts держит ключи, app.ts их переводит), и без
 * этого заголовка английский интерфейс показывал бы русские ошибки.
 */
function localeHeaders(): Record<string, string> {
  return { 'accept-language': i18n.language };
}

/* ──────────────────────────────── запросы ───────────────────────────────── */

/** Маршруты, на которых попытка автоматического refresh лишена смысла. */
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  allowRetry = true,
): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const headers: Record<string, string> = { ...csrfHeaders(), ...localeHeaders() };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    // Куки — единственный способ, которым ходит аутентификация: токенов
    // в localStorage нет, поэтому credentials обязателен на каждом запросе.
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  if (response.status === 401 && allowRetry && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, options, false);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
