import { create } from 'zustand';

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

function persist(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* выбор не сохранится, но в текущей сессии работает */
  }
}

interface ThemeState {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

/**
 * Тема живёт в data-theme на <html>, а переключение — в CSS-переменных
 * (shared/styles/_tokens.scss). React здесь только проставляет атрибут:
 * ни один компонент не знает ни одного цвета.
 *
 * Начальное значение атрибута ставит инлайн-скрипт в index.html — до первой
 * отрисовки, иначе была бы видна вспышка чужой темы.
 *
 * Состояние вынесено в стор, а не в useState внутри хука: выбор темы читает
 * не только переключатель. Всплывающие уведомления рисуются вне нашей
 * вёрстки и получают тему пропом, и на useState они видели бы собственную
 * копию значения, застывшую на моменте монтирования.
 */
const useThemeStore = create<ThemeState>((set) => ({
  choice: read(),
  setChoice: (choice) => {
    apply(choice);
    persist(choice);
    set({ choice });
  },
}));

export function useTheme() {
  const choice = useThemeStore((state) => state.choice);
  const setChoice = useThemeStore((state) => state.setChoice);
  return { choice, setChoice };
}
