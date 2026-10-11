import type { LucideProps } from 'lucide-react';
import { ICONS, type IconName } from './icons.ts';

interface IconProps extends Omit<LucideProps, 'ref' | 'name'> {
  name: IconName;
}

/**
 * Иконка по имени из карты `ICONS`.
 *
 * Размер задаётся снаружи классом, а не пропом `size`: иконка почти всегда
 * стоит рядом с текстом и должна считаться от его размера (`1em`), а не от
 * числа пикселей, выбранного в компоненте.
 *
 * По умолчанию иконка скрыта от скринридера. Она сопровождает подпись —
 * видимую или `visually-hidden`, — и прочитанная вторым голосом только
 * дублирует её. Там, где иконка сама себе подпись, вызывающий передаёт
 * `aria-hidden={false}` и `aria-label`.
 */
export function Icon({ name, ...props }: IconProps) {
  const Component = ICONS[name];

  return (
    <Component
      // 1.8 вместо дефолтных двух: в этой толщине нарисован весь интерфейс.
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
