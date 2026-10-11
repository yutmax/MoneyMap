import { sql } from 'drizzle-orm';
import { db, pg } from '../db/index.ts';
import { currencies } from '../db/schema.ts';

/**
 * Справочник валют (§8.5). Поле `decimals` — это не косметика: от него зависит
 * округление при конвертации, поэтому значения взяты из стандартов, а не
 * «на глаз»: ISO-4217 для фиата, нативная точность сети для крипты.
 */
type Row = typeof currencies.$inferInsert;

const fiat: Row[] = [
  { code: 'USD', kind: 'fiat', decimals: 2, symbol: '$', name: 'Доллар США', sortOrder: 10 },
  { code: 'EUR', kind: 'fiat', decimals: 2, symbol: '€', name: 'Евро', sortOrder: 20 },
  {
    code: 'BYN',
    kind: 'fiat',
    decimals: 2,
    symbol: 'Br',
    name: 'Белорусский рубль',
    sortOrder: 25,
  },
  { code: 'UAH', kind: 'fiat', decimals: 2, symbol: '₴', name: 'Гривна', sortOrder: 30 },
  { code: 'RUB', kind: 'fiat', decimals: 2, symbol: '₽', name: 'Российский рубль', sortOrder: 35 },
  { code: 'PLN', kind: 'fiat', decimals: 2, symbol: 'zł', name: 'Злотый', sortOrder: 40 },
  { code: 'GBP', kind: 'fiat', decimals: 2, symbol: '£', name: 'Фунт стерлингов', sortOrder: 50 },
  {
    code: 'CHF',
    kind: 'fiat',
    decimals: 2,
    symbol: 'CHF',
    name: 'Швейцарский франк',
    sortOrder: 60,
  },
  { code: 'KZT', kind: 'fiat', decimals: 2, symbol: '₸', name: 'Тенге', sortOrder: 70 },
  { code: 'GEL', kind: 'fiat', decimals: 2, symbol: '₾', name: 'Лари', sortOrder: 80 },
  { code: 'TRY', kind: 'fiat', decimals: 2, symbol: '₺', name: 'Турецкая лира', sortOrder: 90 },
  { code: 'CZK', kind: 'fiat', decimals: 2, symbol: 'Kč', name: 'Чешская крона', sortOrder: 100 },
  { code: 'JPY', kind: 'fiat', decimals: 0, symbol: '¥', name: 'Японская иена', sortOrder: 110 },
];

const crypto: Row[] = [
  { code: 'BTC', kind: 'crypto', decimals: 8, symbol: '₿', name: 'Bitcoin', sortOrder: 200 },
  { code: 'ETH', kind: 'crypto', decimals: 18, symbol: 'Ξ', name: 'Ethereum', sortOrder: 210 },
  { code: 'USDT', kind: 'crypto', decimals: 6, symbol: 'USDT', name: 'Tether', sortOrder: 220 },
  { code: 'USDC', kind: 'crypto', decimals: 6, symbol: 'USDC', name: 'USD Coin', sortOrder: 230 },
  { code: 'SOL', kind: 'crypto', decimals: 9, symbol: 'SOL', name: 'Solana', sortOrder: 240 },
  { code: 'TON', kind: 'crypto', decimals: 9, symbol: 'TON', name: 'Toncoin', sortOrder: 250 },
  { code: 'BNB', kind: 'crypto', decimals: 18, symbol: 'BNB', name: 'BNB', sortOrder: 260 },
  { code: 'XMR', kind: 'crypto', decimals: 12, symbol: 'XMR', name: 'Monero', sortOrder: 270 },
];

try {
  const rows = [...fiat, ...crypto];

  // Идемпотентно: сид можно прогонять на существующей базе, он обновит
  // названия и точность, но не затронет пользовательские данные.
  await db
    .insert(currencies)
    .values(rows)
    .onConflictDoUpdate({
      target: currencies.code,
      // excluded.* — значения из текущего INSERT; ссылка на саму колонку
      // скомпилировалась бы в бессмысленное "kind" = "kind".
      set: {
        kind: sql`excluded.kind`,
        decimals: sql`excluded.decimals`,
        symbol: sql`excluded.symbol`,
        name: sql`excluded.name`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  console.log(`Справочник валют заполнен: ${rows.length} записей.`);
  await pg.end();
} catch (error) {
  console.error('Сид не выполнен:', error);
  await pg.end();
  process.exit(1);
}
