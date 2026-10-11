import { ERROR_CODES, type ApiErrorDetail, type ErrorCode } from '@moneymap/shared';

/**
 * Сообщения в AppError — ключи переводов из `@moneymap/shared`, а не готовый
 * текст: язык ответа выбирается по `Accept-Language` уже в обработчике ошибок
 * (app.ts), когда известно, кто спрашивает.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ApiErrorDetail[];
  /** Что писать в лог вместо того, что уйдёт пользователю. */
  readonly logMessage?: string;

  constructor(args: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    logMessage?: string;
  }) {
    super(args.message);
    this.name = 'AppError';
    this.statusCode = args.statusCode;
    this.code = args.code;
    this.details = args.details;
    this.logMessage = args.logMessage;
  }
}

export const badRequest = (message: string, details?: ApiErrorDetail[]) =>
  new AppError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message, details });

export const unauthorized = (message = 'errors.authRequired', logMessage?: string) =>
  new AppError({ statusCode: 401, code: ERROR_CODES.UNAUTHORIZED, message, logMessage });

export const forbidden = (message = 'errors.forbidden') =>
  new AppError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message });

/**
 * 404 используется и для «не твоё» (§10.1): 403 на чужой ресурс раскрывает
 * факт его существования.
 */
export const notFound = (message = 'errors.notFound') =>
  new AppError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message });

export const conflict = (message: string) =>
  new AppError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message });

export const csrfFailed = () =>
  new AppError({
    statusCode: 403,
    code: ERROR_CODES.CSRF_FAILED,
    message: 'errors.csrf',
  });

export const passwordCompromised = () =>
  new AppError({
    statusCode: 400,
    code: ERROR_CODES.PASSWORD_COMPROMISED,
    message: 'errors.passwordCompromised',
    details: [{ path: 'password', message: 'validation.password.compromised' }],
  });

export const sessionReuseDetected = () =>
  new AppError({
    statusCode: 401,
    code: ERROR_CODES.SESSION_REUSE_DETECTED,
    message: 'errors.sessionReuse',
  });
