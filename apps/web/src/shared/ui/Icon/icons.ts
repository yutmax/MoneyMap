import {
  ArrowLeftRight,
  Bell,
  ChartPie,
  Eye,
  EyeOff,
  House,
  Monitor,
  Moon,
  Sun,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Единственное место, где проект знает про lucide.
 *
 * Карта явная, а не `import * as icons`, по двум причинам.
 *
 * Первая: в бандл попадает только перечисленное здесь. Звёздочка притащила бы
 * все полторы тысячи.
 *
 * Вторая важнее. В фазе 1 у счетов и категорий появится поле `icon` — имя
 * иконки строкой в БД (§7). Показывать человеку полторы тысячи вариантов
 * бессмысленно, выбирать он будет из подборки в несколько десятков, и этой
 * подборкой станет как раз эта карта. Заодно имя в базе оказывается нашим,
 * а не чужим: переименование иконки в библиотеке чинится здесь, а не
 * миграцией пользовательских данных.
 */
export const ICONS = {
  eye: Eye,
  'eye-off': EyeOff,
  sun: Sun,
  monitor: Monitor,
  moon: Moon,
  // Разделы приложения: нижняя панель на телефоне, боковая на широком экране.
  home: House,
  transactions: ArrowLeftRight,
  accounts: Wallet,
  reports: ChartPie,
  profile: User,
  bell: Bell,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function isIconName(value: string): value is IconName {
  return value in ICONS;
}
