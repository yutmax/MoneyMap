import type { ImportPreview, ImportResult, ImportRunInput } from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { transactionKeys } from '@/entities/transaction';
import { api } from '@/shared/api';

export function usePreviewCsv() {
  return useMutation({
    mutationFn: async (csv: string) => {
      const { preview } = await api.post<{ preview: ImportPreview }>('/imports/preview', { csv });
      return preview;
    },
  });
}

export function useImportCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportRunInput) => {
      const { result } = await api.post<{ result: ImportResult }>('/imports', input);
      return result;
    },
    // Импорт меняет и ленту, и баланс счёта — обе выборки устарели.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      void queryClient.invalidateQueries({ queryKey: accountKeys.list });
    },
  });
}
