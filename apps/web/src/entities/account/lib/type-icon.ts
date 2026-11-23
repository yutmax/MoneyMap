import type { AccountResponse } from '@moneymap/shared';
import type { IconName } from '@/shared/ui';

const TYPE_ICON: Record<AccountResponse['type'], IconName> = {
  cash: 'banknote',
  bank: 'landmark',
  card: 'credit-card',
  savings: 'piggy-bank',
  crypto_wallet: 'bitcoin',
};

/** Значок типа счёта — один на всё приложение, чтобы карта везде была картой. */
export function accountTypeIcon(type: AccountResponse['type']): IconName {
  return TYPE_ICON[type];
}
