import type {
  CreateTransactionInput,
  CreateTransferInput,
  ListTransactionsQuery,
  TransactionPage,
  TransactionResponse,
  UpdateTransactionInput,
} from '@moneymap/shared';
import { convert, divide, negate, toMoney } from '@moneymap/shared';
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, categories, currencies, transactions } from '../../db/schema.ts';
import { badRequest, conflict, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';
import { getRate } from '../rates/rate.service.ts';

/* ───────────────────────────── чтение и формат ───────────────────────────── */

const selection = {
  id: transactions.id,
  accountId: transactions.accountId,
  accountName: accounts.name,
  accountCurrency: accounts.currencyCode,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  kind: transactions.kind,
  amountOriginal: transactions.amountOriginal,
  currencyOriginal: transactions.currencyOriginal,
  amountAccount: transactions.amountAccount,
  fxRate: transactions.fxRate,
  occurredOn: transactions.occurredOn,
  note: transactions.note,
  transferGroupId: transactions.transferGroupId,
  createdAt: transactions.createdAt,
};

type Row = {
  [K in keyof typeof selection]: unknown;
};

function toResponse(row: Row): TransactionResponse {
  return {
    id: row.id as string,
    accountId: row.accountId as string,
    accountName: row.accountName as string,
    accountCurrency: row.accountCurrency as string,
    categoryId: (row.categoryId as string | null) ?? null,
    categoryName: (row.categoryName as string | null) ?? null,
    kind: row.kind as TransactionResponse['kind'],
    amountOriginal: row.amountOriginal as string,
    currencyOriginal: row.currencyOriginal as string,
    amountAccount: row.amountAccount as string,
    fxRate: row.fxRate as string,
    // date-колонка приходит строкой 'YYYY-MM-DD' — ровно то, что нужно отдать.
    occurredOn: row.occurredOn as string,
    note: (row.note as string | null) ?? null,
    transferGroupId: (row.transferGroupId as string | null) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

/**
 * Курсор — это место в сортировке, а не номер страницы.
 *
 * Сортировка идёт по (occurred_on DESC, id DESC), поэтому и курсор хранит
 * обе части: только по дате не отличить две операции одного дня, а смещение
 * через OFFSET съезжает, стоит добавить операцию задним числом между двумя
 * запросами страниц.
 */
function encodeCursor(occurredOn: string, id: string): string {
  return Buffer.from(`${occurredOn}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { occurredOn: string; id: string } | null {
  try {
    const [occurredOn, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!occurredOn || !id) return null;
    return { occurredOn, id };
  } catch {
    return null;
  }
}

export async function listTransactions(
  db: Db,
  scope: Scope,
  query: ListTransactionsQuery,
): Promise<TransactionPage> {
  const filters: Array<SQL | undefined> = [];

  if (query.accountId) filters.push(eq(transactions.accountId, query.accountId));
  if (query.categoryId) filters.push(eq(transactions.categoryId, query.categoryId));
  if (query.kind) filters.push(eq(transactions.kind, query.kind));
  if (query.from) filters.push(gte(transactions.occurredOn, query.from));
  if (query.to) filters.push(lte(transactions.occurredOn, query.to));
  if (query.search) filters.push(ilike(transactions.note, `%${query.search}%`));

  if (query.cursor) {
    const position = decodeCursor(query.cursor);
    // Непонятный курсор — не ошибка клиента, а, например, старая ссылка.
    // Отдаём первую страницу вместо падения.
    if (position) {
      // Строго «раньше по дате ИЛИ тот же день, но меньший id». Одного
      // сравнения по дате не хватает: операции одного дня тогда либо
      // повторятся на следующей странице, либо пропадут.
      filters.push(
        or(
          sql`${transactions.occurredOn} < ${position.occurredOn}`,
          and(
            eq(transactions.occurredOn, position.occurredOn),
            sql`${transactions.id} < ${position.id}`,
          ),
        ),
      );
    }
  }

  const rows = await db
    .select(selection)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(scope.own(transactions, ...filters))
    .orderBy(desc(transactions.occurredOn), desc(transactions.id))
    // Берём на одну больше запрошенного: наличие лишней и есть ответ
    // на вопрос «а есть ли ещё страница».
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);

  return {
    transactions: page.map((row) => toResponse(row as Row)),
    nextCursor: hasMore && last ? encodeCursor(last.occurredOn as string, last.id as string) : null,
  };
}

export async function getTransaction(
  db: Db,
  scope: Scope,
  id: string,
): Promise<TransactionResponse> {
  const [row] = await db
    .select(selection)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(scope.own(transactions, eq(transactions.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.transactionNotFound');
  return toResponse(row as Row);
}

/* ─────────────────────────────── проверки ───────────────────────────────── */

async function loadAccount(db: Db, scope: Scope, accountId: string) {
  const [account] = await db
    .select({
      id: accounts.id,
      currencyCode: accounts.currencyCode,
      // Разрядность валюты счёта: ею округляется пересчёт из чужой валюты.
      decimals: currencies.decimals,
      isArchived: accounts.isArchived,
    })
    .from(accounts)
    .innerJoin(currencies, eq(currencies.code, accounts.currencyCode))
    .where(scope.own(accounts, eq(accounts.id, accountId)))
    .limit(1);

  if (!account) throw notFound('errors.accountNotFound');
  // В архив убирают закрытый счёт. Новая операция по нему — почти всегда
  // промах в выпадающем списке, а не намерение.
  if (account.isArchived) throw badRequest('errors.accountArchived');
  return account;
}

async function assertCategory(
  db: Db,
  scope: Scope,
  categoryId: string,
  kind: 'income' | 'expense',
): Promise<void> {
  const [category] = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(scope.own(categories, eq(categories.id, categoryId)))
    .limit(1);

  if (!category) throw notFound('errors.categoryNotFound');
  // Своё сообщение, а не то, что у вложенности категорий: там речь про
  // родителя, и на форме операции оно звучало бы не о том.
  if (category.kind !== kind) throw badRequest('errors.categoryKindForTransaction');
}

/* ──────────────────────────── создание операций ─────────────────────────── */

async function findByIdempotencyKey(
  db: Db,
  scope: Scope,
  key: string,
): Promise<TransactionResponse | null> {
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(scope.ownIncludingDeleted(transactions, eq(transactions.idempotencyKey, key)))
    .limit(1);

  return existing ? getTransaction(db, scope, existing.id) : null;
}

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Сумма операции в валюте счёта и зафиксированный курс (§5.2, §8.5).
 *
 * Три случая по убыванию точности:
 *  1. валюты совпадают — курс единица, пересчитывать нечего;
 *  2. человек ввёл, сколько списалось, — курс выводится из двух сумм,
 *     вместе с комиссией банка, как и у перевода (§7.2);
 *  3. не ввёл — берётся курс на дату операции.
 *
 * Курс сохраняется в операции и больше не пересчитывается: иначе вчерашний
 * расход менял бы размер вместе с сегодняшними торгами.
 */
async function toAccountAmount(
  db: Db,
  args: {
    amount: string;
    currency: string;
    account: { currencyCode: string; decimals: number };
    occurredOn: string;
    amountAccount?: string | undefined;
  },
): Promise<{ amount: string; fxRate: string }> {
  if (args.currency === args.account.currencyCode) {
    return { amount: args.amount, fxRate: '1' };
  }
  if (args.amountAccount) {
    return { amount: args.amountAccount, fxRate: toMoney(divide(args.amountAccount, args.amount)) };
  }

  const rate = await getRate(db, args.currency, args.account.currencyCode, args.occurredOn);
  return {
    amount: convert(args.amount, rate.rate, args.account.decimals),
    fxRate: rate.rate,
  };
}

export async function createTransaction(
  db: Db,
  scope: Scope,
  input: CreateTransactionInput,
  idempotencyKey?: string,
): Promise<TransactionResponse> {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(db, scope, idempotencyKey);
    if (existing) return existing;
  }

  const account = await loadAccount(db, scope, input.accountId);
  if (input.categoryId) await assertCategory(db, scope, input.categoryId, input.kind);

  const currencyOriginal = input.currency
    ? await assertCurrencyExists(db, input.currency, 'currency')
    : account.currencyCode;

  const converted = await toAccountAmount(db, {
    amount: input.amount,
    currency: currencyOriginal,
    account,
    occurredOn: input.occurredOn,
    amountAccount: input.amountAccount,
  });

  // Знак выводится здесь и только здесь (§7.1): клиент присылает сумму,
  // а чем она является для баланса — решает вид операции.
  const amountAccount = input.kind === 'expense' ? negate(converted.amount) : converted.amount;

  try {
    const [created] = await db
      .insert(transactions)
      .values(
        scope.stamp({
          accountId: account.id,
          categoryId: input.categoryId ?? null,
          kind: input.kind,
          amountOriginal: input.amount,
          currencyOriginal,
          amountAccount,
          fxRate: converted.fxRate,
          occurredOn: input.occurredOn,
          note: input.note ?? null,
          idempotencyKey: idempotencyKey ?? null,
        }),
      )
      .returning({ id: transactions.id });

    if (!created) throw new Error('Операция не создана');
    return getTransaction(db, scope, created.id);
  } catch (error) {
    // Две одинаковые отправки разошлись по времени на миллисекунды и прошли
    // проверку выше обе. Уникальный индекс поймал вторую — возвращаем первую.
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findByIdempotencyKey(db, scope, idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Перевод — две транзакции с общим transferGroupId (§7.2).
 *
 * Обе ноги пишутся в одной транзакции БД: перевод, у которого списание
 * произошло, а зачисление нет, — это пропавшие деньги, и отсутствие такого
 * состояния важнее скорости вставки.
 */
export async function createTransfer(
  db: Db,
  scope: Scope,
  input: CreateTransferInput,
  idempotencyKey?: string,
): Promise<TransactionResponse[]> {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(db, scope, idempotencyKey);
    if (existing?.transferGroupId) {
      return listTransferLegs(db, scope, existing.transferGroupId);
    }
  }

  const from = await loadAccount(db, scope, input.fromAccountId);
  const to = await loadAccount(db, scope, input.toAccountId);

  const sameCurrency = from.currencyCode === to.currencyCode;
  if (!sameCurrency && !input.toAmount) {
    throw badRequest('errors.currencyMismatch', [
      { path: 'toAmount', message: 'validation.transfer.toAmountRequired' },
    ]);
  }

  const received = sameCurrency ? input.amount : (input.toAmount as string);
  // Кросс-курс выводится из двух сумм, а не берётся из справочника: человек
  // вводит то, что реально пришло, вместе с комиссией обменника.
  const rate = sameCurrency ? '1' : toMoney(divide(received, input.amount));
  const groupId = crypto.randomUUID();

  const legs = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(transactions)
      .values([
        scope.stamp({
          accountId: from.id,
          kind: 'transfer' as const,
          amountOriginal: input.amount,
          currencyOriginal: from.currencyCode,
          amountAccount: negate(input.amount),
          fxRate: '1',
          occurredOn: input.occurredOn,
          note: input.note ?? null,
          transferGroupId: groupId,
          idempotencyKey: idempotencyKey ?? null,
        }),
        scope.stamp({
          accountId: to.id,
          kind: 'transfer' as const,
          amountOriginal: received,
          currencyOriginal: to.currencyCode,
          amountAccount: received,
          fxRate: rate,
          occurredOn: input.occurredOn,
          note: input.note ?? null,
          transferGroupId: groupId,
          // Ключ идемпотентности уникален на пользователя, поэтому его несёт
          // только первая нога — вторая опознаётся по группе.
          idempotencyKey: null,
        }),
      ])
      .returning({ id: transactions.id });

    return inserted;
  });

  if (legs.length !== 2) throw new Error('Перевод создан не полностью');
  return listTransferLegs(db, scope, groupId);
}

async function listTransferLegs(
  db: Db,
  scope: Scope,
  groupId: string,
): Promise<TransactionResponse[]> {
  const rows = await db
    .select(selection)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(scope.own(transactions, eq(transactions.transferGroupId, groupId)))
    .orderBy(asc(transactions.amountAccount));

  return rows.map((row) => toResponse(row as Row));
}

/* ──────────────────────── изменение и удаление ──────────────────────────── */

export async function updateTransaction(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionResponse> {
  const current = await getTransaction(db, scope, id);

  // Нога перевода связана со второй суммой и курсом. Правка одной стороны
  // оставила бы перевод, где ушло не то, что пришло.
  if (current.transferGroupId) throw conflict('errors.transferLegEdit');

  if (input.categoryId) {
    await assertCategory(db, scope, input.categoryId, current.kind as 'income' | 'expense');
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.occurredOn !== undefined) patch.occurredOn = input.occurredOn;
  if (input.note !== undefined) patch.note = input.note;

  if (input.amount !== undefined || input.amountAccount !== undefined) {
    const account = await loadAccount(db, scope, current.accountId);
    const amount = input.amount ?? current.amountOriginal;

    // Курс берётся из самой операции, а не из справочника на сегодня:
    // правка суммы — это исправление опечатки, а не повторный обмен валюты
    // по новому курсу. Новый курс появляется только если человек сам прислал
    // сумму списания.
    const converted =
      input.amountAccount !== undefined
        ? { amount: input.amountAccount, fxRate: toMoney(divide(input.amountAccount, amount)) }
        : {
            amount: convert(amount, current.fxRate, account.decimals),
            fxRate: current.fxRate,
          };

    patch.amountOriginal = amount;
    patch.amountAccount = current.kind === 'expense' ? negate(converted.amount) : converted.amount;
    patch.fxRate = converted.fxRate;
  }

  await db
    .update(transactions)
    .set(patch)
    .where(scope.own(transactions, eq(transactions.id, id)));

  return getTransaction(db, scope, id);
}

/**
 * Удаление мягкое (§5.5). У перевода удаляются обе ноги: половина перевода
 * в истории — это не запись, а расхождение баланса.
 */
export async function deleteTransaction(db: Db, scope: Scope, id: string): Promise<number> {
  const current = await getTransaction(db, scope, id);
  const now = new Date();

  const condition = current.transferGroupId
    ? scope.own(transactions, eq(transactions.transferGroupId, current.transferGroupId))
    : scope.own(transactions, eq(transactions.id, id));

  const removed = await db
    .update(transactions)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(condition, isNull(transactions.deletedAt)))
    .returning({ id: transactions.id });

  return removed.length;
}
