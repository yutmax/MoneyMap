import { categoryReportQuerySchema, reportPeriodSchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
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
