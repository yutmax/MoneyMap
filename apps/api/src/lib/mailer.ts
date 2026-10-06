import type { FastifyBaseLogger } from 'fastify';
import { env, isProduction } from './env.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Отправка письма — фаза 6 спеки. До тех пор работает заглушка, которая
 * печатает письмо в лог: это позволяет пройти верификацию email и сброс пароля
 * в разработке без провайдера, и при этом ссылки в коде уже настоящие.
 *
 * В production отсутствие провайдера логируется как ошибка, но не ломает
 * запрос: пользователь не должен получать 500 из-за того, что у нас не
 * подключён Resend.
 */
export function sendMail(log: FastifyBaseLogger, mail: Mail): void {
  if (isProduction) {
    log.error(
      { to: mail.to, subject: mail.subject },
      'Провайдер email не подключён, письмо не отправлено',
    );
    return;
  }
  log.info(
    `\n─── письмо ───\nКому: ${mail.to}\nТема: ${mail.subject}\n\n${mail.text}\n──────────────\n`,
  );
}

export const mailLinks = {
  verifyEmail: (token: string) => `${env.PUBLIC_WEB_URL}/verify-email?token=${token}`,
  resetPassword: (token: string) => `${env.PUBLIC_WEB_URL}/reset-password?token=${token}`,
};
