import type { CashflowReport, CategoryReport, ReportSummary } from '@moneymap/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

export interface ReportPeriodArgs {
  from: string;
  to: string;
}

export const reportKeys = {
  all: ['report'] as const,
  summary: (period: ReportPeriodArgs) => ['report', 'summary', period] as const,
  byCategory: (period: ReportPeriodArgs, kind: string) =>
    ['report', 'by-category', period, kind] as const,
  cashflow: (period: ReportPeriodArgs) => ['report', 'cashflow', period] as const,
};

function query(period: ReportPeriodArgs): string {
  return new URLSearchParams({ from: period.from, to: period.to }).toString();
}

export function useReportSummary(period: ReportPeriodArgs) {
  return useQuery({
    queryKey: reportKeys.summary(period),
    queryFn: async ({ signal }) => {
      const { report } = await api.get<{ report: ReportSummary }>(
        `/reports/summary?${query(period)}`,
        signal,
      );
      return report;
    },
    // Предыдущий отчёт остаётся на экране, пока грузится новый период:
    // иначе смена периода мигает пустотой на всех четырёх блоках сразу.
    placeholderData: (previous) => previous,
  });
}

export function useCategoryReport(period: ReportPeriodArgs, kind: 'income' | 'expense') {
  return useQuery({
    queryKey: reportKeys.byCategory(period, kind),
    queryFn: async ({ signal }) => {
      const { report } = await api.get<{ report: CategoryReport }>(
        `/reports/by-category?${query(period)}&kind=${kind}`,
        signal,
      );
      return report;
    },
    placeholderData: (previous) => previous,
  });
}

export function useCashflowReport(period: ReportPeriodArgs) {
  return useQuery({
    queryKey: reportKeys.cashflow(period),
    queryFn: async ({ signal }) => {
      const { report } = await api.get<{ report: CashflowReport }>(
        `/reports/cashflow?${query(period)}`,
        signal,
      );
      return report;
    },
    placeholderData: (previous) => previous,
  });
}

/** Ссылка на выгрузку. Файл отдаёт сервер — браузеру остаётся его скачать. */
export function csvUrl(period: ReportPeriodArgs): string {
  return `/api/reports/export.csv?${query(period)}`;
}
