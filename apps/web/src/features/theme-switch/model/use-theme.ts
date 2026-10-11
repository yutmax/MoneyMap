import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'moneymap.theme';

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    // Приватный режим или заблокированное хранилище — остаётся системная тема.
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
}

/**
 * Тема живёт в data-theme на <html>, а переключение — в CSS-переменных
 * (styles/_tokens.scss). React здесь только проставляет атрибут: ни один
 * компонент не знает ни одного цвета.
 *
 * Начальное значение атрибута ставит инлайн-скрипт в index.html — до первой
 * отрисовки, иначе была бы видна вспышка чужой темы.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);

  useEffect(() => {
    apply(choice);
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* выбор не сохранится, но в текущей сессии работает */
    }
  }, [choice]);

  return { choice, setChoice };
}
