/** Коды ошибок API. Фронтенд ветвится по коду, а не по тексту сообщения. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  CSRF_FAILED: 'CSRF_FAILED',
  SESSION_REUSE_DETECTED: 'SESSION_REUSE_DETECTED',
  PASSWORD_COMPROMISED: 'PASSWORD_COMPROMISED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** Формат ошибки из §9. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  return (
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
