import {
  LOCALES,
  parseUserAmount,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
} from '@moneymap/shared';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, categories, transactions } from '../../db/schema.ts';
import { badRequest, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { categoryName } from '../categories/category.catalog.ts';

/**
 * Импорт выписки из CSV (§8.11).
 *
 * Своего разбора, а не библиотеки: формат описан в RFC 4180 на полторы
 * страницы, а весь нужный разбор — кавычки, удвоенные кавычки внутри них
 * и переводы строк внутри поля — умещается в тридцать строк. Зависимость
 * ради этого пришлось бы обновлять дольше, чем читать этот файл.
 */

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 5;

/** Разделитель определяется по первой строке: банки пишут и через точку с запятой. */
function detectDelimiter(text: string): string {
  const [first = ''] = text.split(/\r?\n/, 1);
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ',';
}

export function parseCsv(text: string, delimiter: string): string[][] {
  // BOM, который мы же и добавляем при выгрузке, иначе попадёт в имя
  // первой колонки и сломает сопоставление.
  const input = text.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Пустые строки в конце файла — обычное дело и данными не являются.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Дата в том виде, в котором её пишут банки. */
function parseDate(value: string): string | null {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(text);
  if (dotted) {
    const [, day, month, year] = dotted as unknown as [string, string, string, string];
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

/** Сумма из выписки: минус, скобки как минус, пробелы разрядов, запятая. */
function parseAmount(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  const negative = text.startsWith('(') && text.endsWith(')');
  try {
    const amount = parseUserAmount(negative ? text.slice(1, -1) : text);
    return negative && !amount.startsWith('-') ? `-${amount}` : amount;
  } catch {
    return null;
  }
}

function guess(columns: string[], candidates: string[]): number | null {
  const index = columns.findIndex((name) =>
    candidates.some((word) => name.trim().toLowerCase().includes(word)),
  );
  return index === -1 ? null : index;
}

/**
 * Что в файле и какие колонки за что отвечают (§8.11).
 *
 * Догадка по заголовкам — подсказка, а не решение: человек видит
 * предпросмотр и правит сопоставление до того, как что-то запишется.
 */
export function previewCsv(text: string): ImportPreview {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) throw badRequest('errors.importEmpty');

  const [header = [], ...body] = rows;

  return {
    delimiter,
    columns: header.map((name) => name.trim()),
    rows: body.slice(0, PREVIEW_ROWS),
    total: body.length,
    suggested: {
      date: guess(header, ['date', 'дата']),
      amount: guess(header, ['amount', 'сумма', 'оборот']),
      note: guess(header, ['note', 'описание', 'назначение', 'примечание', 'коммент']),
      category: guess(header, ['category', 'категор']),
    },
  };
}

/**
 * Отпечаток строки для дедупликации.
 *
 * Считается от счёта, даты, суммы и примечания: идентификатора строки банк
 * не даёт, а эти четыре вместе повторяются только у настоящего дубля.
 * Две одинаковые покупки в один день на одну сумму и с одним описанием —
 * действительно неразличимы, и импорт возьмёт одну; в выписке они и были
 * одной строкой.
 */
function hashRow(accountId: string, date: string, amount: string, note: string): string {
  return createHash('sha256').update(`${accountId}|${date}|${amount}|${note}`).digest('hex');
}

export async function importCsv(
  db: Db,
  scope: Scope,
  args: { csv: string; accountId: string; mapping: ImportMapping; delimiter?: string },
): Promise<ImportResult> {
  const [account] = await db
    .select({ id: accounts.id, currencyCode: accounts.currencyCode })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, args.accountId)))
    .limit(1);
  if (!account) throw notFound('errors.accountNotFound');

  const rows = parseCsv(args.csv, args.delimiter ?? detectDelimiter(args.csv));
  const body = rows.slice(1);
  if (body.length > MAX_ROWS) throw badRequest('errors.importTooLarge');

  const owned = await db
    .select({ id: categories.id, defaultKey: categories.defaultKey })
    .from(categories)
    .where(scope.own(categories));

  /**
   * Имя из файла сверяется с подписями на всех языках сразу, а не только на
   * языке запроса: выгрузка, сделанная в английском интерфейсе, должна
   * заходить обратно и в русском. Сам ключ тоже принимается — на случай
   * файла, собранного не нами.
   */
  const known = new Map<string, string>();
  for (const row of owned) {
    known.set(row.defaultKey.toLowerCase(), row.id);
    for (const locale of LOCALES) {
      known.set(categoryName(locale, row.defaultKey).trim().toLowerCase(), row.id);
    }
  }

  const values: (typeof transactions.$inferInsert)[] = [];
  const failed: number[] = [];

  body.forEach((cells, index) => {
    const date = parseDate(cells[args.mapping.date] ?? '');
    const amount = parseAmount(cells[args.mapping.amount] ?? '');
    if (!date || !amount) {
      // Номер строки — тот, что человек видит в файле: заголовок первый.
      failed.push(index + 2);
      return;
    }

    const note = args.mapping.note === null ? '' : (cells[args.mapping.note] ?? '').trim();
    const categoryName =
      args.mapping.category === null ? '' : (cells[args.mapping.category] ?? '').trim();
    const expense = amount.startsWith('-');

    values.push(
      scope.stamp({
        accountId: account.id,
        // Категория подбирается по имени и только из существующих: создавать
        // категории из чужого файла — это дерево, собранное банком.
        categoryId: known.get(categoryName.toLowerCase()) ?? null,
        kind: expense ? ('expense' as const) : ('income' as const),
        amountOriginal: expense ? amount.slice(1) : amount,
        currencyOriginal: account.currencyCode,
        amountAccount: amount,
        fxRate: '1',
        occurredOn: date,
        note: note === '' ? null : note,
        importHash: hashRow(account.id, date, amount, note),
      }),
    );
  });

  let imported = 0;
  if (values.length > 0) {
    const inserted = await db
      .insert(transactions)
      .values(values)
      // Повтор файла отсекается уникальным индексом, а не сравнением
      // в приложении: так он отсекается и при двух импортах разом.
      .onConflictDoNothing({ target: [transactions.userId, transactions.importHash] })
      .returning({ id: transactions.id });
    imported = inserted.length;
  }

  return {
    imported,
    duplicates: values.length - imported,
    failed,
  };
}
