import {
  budgetsQuerySchema,
  importPreviewSchema,
  importRunSchema,
  categoryReportQuerySchema,
  reportPeriodSchema,
  setBudgetsSchema,
} from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import { listBudgets, setBudgets } from './budget.service.ts';
import { importCsv, previewCsv } from './import.service.ts';
import { cashflowReport, categoryReport, exportCsv, summaryReport } from './report.service.ts';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/summary', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const period = parse(reportPeriodSchema, request.query);
    return reply.send({ report: await summaryReport(db, scope, period) });
  });

  app.get('/by-category', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const query = parse(categoryReportQuerySchema, request.query);
    return reply.send({ report: await categoryReport(db, scope, query) });
  });

  app.get('/cashflow', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const period = parse(reportPeriodSchema, request.query);
    return reply.send({ report: await cashflowReport(db, scope, period) });
  });

  /**
   * Выгрузка операций за период (§8.9).
   *
   * Отдаётся как файл, а не как JSON для разбора на клиенте: CSV собирается
   * из тех же строк, что и отчёт, и перекладывать эту работу в браузер —
   * значит иметь две реализации одного формата.
   */
  app.get('/export.csv', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const period = parse(reportPeriodSchema, request.query);
    const csv = await exportCsv(db, scope, period);

    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="moneymap-${period.from}-${period.to}.csv"`,
      )
      .send(csv);
  });
}

/** Бюджеты по категориям (§8.10). */
export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { month } = parse(budgetsQuerySchema, request.query);
    return reply.send(await listBudgets(db, scope, month));
  });

  /**
   * Замена набора целиком, как и описано в §9: отдельных POST и DELETE нет,
   * потому что лимиты правят списком — поставил напротив трёх категорий
   * новые суммы и сохранил.
   */
  app.put('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(setBudgetsSchema, request.body);
    await setBudgets(db, scope, input);
    return reply.send(await listBudgets(db, scope));
  });
}

/** Импорт выписки (§8.11). */
export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Файл приезжает в теле запроса строкой, поэтому предел тела поднят:
  // выписка за год — это сотни килобайт, и стандартного мегабайта ей мало.
  const bodyLimit = 6 * 1024 * 1024;

  app.post('/preview', { bodyLimit }, async (request, reply) => {
    const { csv } = parse(importPreviewSchema, request.body);
    return reply.send({ preview: previewCsv(csv) });
  });

  app.post('/', { bodyLimit }, async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(importRunSchema, request.body);
    return reply.send({ result: await importCsv(db, scope, input) });
  });
}
