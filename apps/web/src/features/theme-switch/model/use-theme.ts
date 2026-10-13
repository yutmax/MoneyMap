import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark';

const STORAGE_KEY = 'moneymap.theme';

/**
 * Тема системы на момент загрузки.
 *
 * Отдельного пункта «как в системе» в переключателе нет: две кнопки вместо
 * трёх, а системная настройка решает, с какой из них приложение откроется.
 * Поэтому значение читается один раз при старте, а не отслеживается дальше —
 * смена темы в системе доедет при следующей загрузке, пока человек не выбрал
 * тему руками. После выбора его решение сильнее системного, и так и должно
 * быть: он сказал прямо.
 */
function systemTheme(): ThemeChoice {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    // matchMedia нет только там, где нет и тёмной темы.
    return 'light';
  }
}

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Приватный режим или заблокированное хранилище: выбора нет, берём системную.
  }
  return systemTheme();
}

function apply(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = choice;
}

function persist(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
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
 * Тот же выбор повторяет инлайн-скрипт в index.html — до первой отрисовки,
 * иначе была бы видна вспышка чужой темы. Здесь он делается ещё раз, чтобы
 * состояние переключателя и атрибут совпадали, даже если скрипт не отработал.
 *
 * Состояние вынесено в стор, а не в useState внутри хука: выбор темы читает
 * не только переключатель. Всплывающие уведомления рисуются вне нашей
 * вёрстки и получают тему пропом, и на useState они видели бы собственную
 * копию значения, застывшую на моменте монтирования.
 */
const useThemeStore = create<ThemeState>((set) => {
  const initial = read();
  apply(initial);

  return {
    choice: initial,
    setChoice: (choice) => {
      apply(choice);
      persist(choice);
      set({ choice });
    },
  };
});

export function useTheme() {
  const choice = useThemeStore((state) => state.choice);
  const setChoice = useThemeStore((state) => state.setChoice);
  return { choice, setChoice };
}
