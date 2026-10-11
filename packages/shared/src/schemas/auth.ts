import { z } from 'zod';
import { currencyCodeSchema, timezoneSchema, uuidSchema } from './common.ts';

export const emailSchema = z.email({ message: 'Некорректный email' }).trim().toLowerCase().max(254);

/**
 * Минимум 8 символов. Нижняя граница выбрана в паре с проверкой по базе
 * утечек: на шести знаках практически любой пароль, который человек способен
 * придумать, уже встречается в дампах (`maria7` — 19 495 раз), и форма
 * обещала бы шесть, отклоняя почти всё введённое. Верхняя граница — не «на
 * всякий случай»: argon2 считает хеш от всей строки, и мегабайтный пароль
 * превращается в бесплатный DoS.
 */
export const passwordSchema = z
  .string()
  .min(8, { message: 'Минимум 8 символов' })
  .max(200, { message: 'Не больше 200 символов' });

/**
 * Регистрация спрашивает только то, без чего нельзя создать учётную запись.
 * Базовая валюта и таймзона переехали в онбординг: на форме регистрации они
 * требуют решения от человека, который ещё не видел приложения и не знает,
 * на что эти параметры влияют.
 */
export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, { message: 'Укажите имя' }).max(100),
  password: passwordSchema,
});

/** Первичная настройка после регистрации — то, что ушло с формы регистрации. */
export const onboardingSchema = z.object({
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
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Пользователь в том виде, в котором его отдаёт GET /auth/me. */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  /** null до прохождения онбординга: значения по умолчанию не выдумываются. */
  baseCurrency: string | null;
  timezone: string | null;
  emailVerified: boolean;
  /**
   * Отметка о пройденной первичной настройке.
   *
   * Отдельное поле, а не вывод из `baseCurrency !== null`: онбординг будет
   * прирастать шагами (первый счёт — фаза 1), которым не соответствует ни одна
   * колонка в users. Признак «настроен» не должен зависеть от того, какой
   * конкретно шаг оказался последним.
   */
  onboardedAt: string | null;
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
