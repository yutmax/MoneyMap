import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Briefcase,
  Bus,
  Car,
  ChartPie,
  CircleAlert,
  CircleCheck,
  CircleEllipsis,
  Clapperboard,
  Dumbbell,
  Eye,
  EyeOff,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Info,
  Landmark,
  LogOut,
  Moon,
  PartyPopper,
  PawPrint,
  Plane,
  Plug,
  Repeat,
  RotateCcw,
  Shirt,
  ShoppingCart,
  Sparkles,
  Sun,
  TrendingUp,
  User,
  Utensils,
  Wallet,
  Wifi,
  X,
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
  moon: Moon,
  // Разделы приложения: нижняя панель на телефоне, боковая на широком экране.
  home: House,
  transactions: ArrowLeftRight,
  accounts: Wallet,
  reports: ChartPie,
  profile: User,
  bell: Bell,
  'log-out': LogOut,

  // Всплывающие уведомления: свои значки вместо залитых глифов sonner —
  // у них другая толщина и заливка, и на фоне обведённых lucide они
  // читались как чужие.
  'circle-check': CircleCheck,
  'circle-alert': CircleAlert,
  info: Info,
  x: X,

  /*
   * Категории (§8.4). Имена здесь описывают категорию, а не рисунок: в базе
   * лежит `housing`, а не `house`, и подобрать жилью другую картинку значит
   * поправить одну строку ниже, а не переписывать строки у всех пользователей.
   * Поэтому `housing` и `home` — два имени на один компонент, и это намеренно.
   */
  banknote: Banknote,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  'rotate-ccw': RotateCcw,
  gift: Gift,
  'circle-ellipsis': CircleEllipsis,

  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  bus: Bus,
  car: Car,
  housing: House,
  plug: Plug,
  wifi: Wifi,
  'heart-pulse': HeartPulse,
  sparkles: Sparkles,
  shirt: Shirt,
  clapperboard: Clapperboard,
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  plane: Plane,
  'paw-print': PawPrint,
  repeat: Repeat,
  'party-popper': PartyPopper,
  landmark: Landmark,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function isIconName(value: string): value is IconName {
  return value in ICONS;
}
