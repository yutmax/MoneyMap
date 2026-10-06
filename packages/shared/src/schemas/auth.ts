import { z } from 'zod';
import { currencyCodeSchema, timezoneSchema, uuidSchema } from './common.ts';

export const emailSchema = z.email({ message: 'Некорректный email' }).trim().toLowerCase().max(254);

/**
 * Минимум 10 символов по §6.5. Верхняя граница — не «на всякий случай»:
 * argon2 считает хеш от всей строки, и мегабайтный пароль превращается
 * в бесплатный DoS.
 */
export const passwordSchema = z
  .string()
  .min(10, { message: 'Минимум 10 символов' })
  .max(200, { message: 'Не больше 200 символов' });

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, { message: 'Укажите имя' }).max(100),
  password: passwordSchema,
  baseCurrency: currencyCodeSchema,
  timezone: timezoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Введите пароль' }).max(200),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const updateSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    baseCurrency: currencyCodeSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Нечего менять' });

export const sessionIdParamSchema = z.object({ id: uuidSchema });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Пользователь в том виде, в котором его отдаёт GET /auth/me. */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  emailVerified: boolean;
  createdAt: string;
}

/** Элемент списка активных устройств (§6.4). */
export interface SessionSummary {
  id: string;
  device: string;
  browser: string | null;
  os: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
