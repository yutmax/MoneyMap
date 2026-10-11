import { useMemo, type ComponentPropsWithRef } from 'react';
import { useT } from '@/shared/i18n';
import { Select } from '../Select/Select.tsx';
import { timezoneOptions } from './timezones.ts';

type TimezoneSelectProps = Omit<ComponentPropsWithRef<typeof Select>, 'children' | 'label'> & {
  label?: string;
};

/**
 * Выбор таймзоны списком, а не текстовым полем.
 *
 * Точный IANA-идентификатор угадать почти невозможно: это не «Минск», а
 * `Europe/Minsk`, и не «Киев», а `Europe/Kyiv` — причём до 2022 года было
 * `Europe/Kiev`. Текстовое поле здесь означает, что человек либо оставляет
 * угаданное браузером, либо ошибается.
 *
 * Рядом с названием — смещение: в списке из четырёхсот городов оно и есть
 * то, по чему выбирают, когда своего города в списке нет.
 */
export function TimezoneSelect({ label, ...props }: TimezoneSelectProps) {
  const { t, locale } = useT();
  const options = useMemo(() => timezoneOptions(locale), [locale]);

  const groups = useMemo(() => {
    const byArea = new Map<string, typeof options>();
    for (const option of options) {
      const list = byArea.get(option.area);
      if (list) list.push(option);
      else byArea.set(option.area, [option]);
    }
    return [...byArea.entries()];
  }, [options]);

  return (
    <Select label={label ?? t('fields.timezone')} {...props}>
      {groups.map(([area, items]) => (
        <optgroup key={area} label={area}>
          {items.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
