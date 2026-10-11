import type { ComponentPropsWithRef } from 'react';
import { Select } from '@/shared/ui';
import { useCurrencies } from '../api/currency-queries.ts';

// label исключается из Omit и объявляется заново необязательным: у выбора
// валюты есть осмысленная подпись по умолчанию.
type CurrencySelectProps = Omit<ComponentPropsWithRef<typeof Select>, 'children' | 'label'> & {
  label?: string;
};

/**
 * Выбор валюты из справочника.
 *
 * Группировка на фиат и криптовалюты — не украшение: в списке из двух десятков
 * кодов BTC рядом с BYN выглядит опечаткой, а не осознанным выбором.
 *
 * Компонент сам тянет справочник и не принимает его пропом: иначе каждая
 * форма, которой нужен выбор валюты, повторяла бы один и тот же запрос
 * и одну и ту же обработку загрузки.
 */
export function CurrencySelect({ label = 'Базовая валюта', ...props }: CurrencySelectProps) {
  const currencies = useCurrencies();

  const fiat = currencies.data?.filter((c) => c.kind === 'fiat') ?? [];
  const crypto = currencies.data?.filter((c) => c.kind === 'crypto') ?? [];

  return (
    <Select label={label} disabled={props.disabled ?? currencies.isPending} {...props}>
      <optgroup label="Фиат">
        {fiat.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Криптовалюты">
        {crypto.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
