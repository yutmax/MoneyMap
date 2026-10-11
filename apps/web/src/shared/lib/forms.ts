import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../api/client.ts';

/**
 * Раскладывает ошибку API по полям формы и возвращает то, что осталось
 * показать общим сообщением.
 *
 * Возвращает и раскладывает ключи переводов, а не готовый текст: сообщения
 * приходят от сервера уже переведёнными по Accept-Language, но свои —
 * сетевые — приходится называть ключом, чтобы их перевёл компонент.
 *
 * Серверная валидация возвращает details c путями (§9), и путь совпадает
 * с именем поля — потому что схема у формы и у эндпоинта буквально одна
 * и та же (packages/shared). Поэтому раскладка механическая.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: ReadonlyArray<Path<T>>,
): string | null {
  if (!(error instanceof ApiError)) {
    return 'errors.network';
  }

  let assignedAny = false;
  for (const detail of error.details) {
    const field = knownFields.find((name) => name === detail.path);
    if (!field) continue;
    setError(field, { type: 'server', message: detail.message });
    assignedAny = true;
  }

  // Если каждое сообщение нашло своё поле, общий блок был бы дублированием.
  return assignedAny ? null : error.message;
}
