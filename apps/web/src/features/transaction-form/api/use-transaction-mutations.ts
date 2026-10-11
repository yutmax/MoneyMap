import type {
  CreateTransactionInput,
  CreateTransferInput,
  TransactionResponse,
  UpdateTransactionInput,
} from '@moneymap/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/entities/account';
import { transactionKeys } from '@/entities/transaction';
import { api } from '@/shared/api';

/** Операция меняет баланс счёта, поэтому список счетов устаревает вместе со списком операций. */
function useLedgerInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    void queryClient.invalidateQueries({ queryKey: accountKeys.list });
  };
}

export function useCreateTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: async ({ input, key }: { input: CreateTransactionInput; key: string }) => {
      const { transaction } = await api.post<{ transaction: TransactionResponse }>(
        '/transactions',
        input,
        // Повтор на нестабильной сети или второе нажатие не должны
        // превращаться в две одинаковые операции (§8.3).
        { 'idempotency-key': key },
      );
      return transaction;
    },
    onSuccess: invalidate,
  });
}

export function useCreateTransfer() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: async ({ input, key }: { input: CreateTransferInput; key: string }) => {
      const { transactions } = await api.post<{ transactions: TransactionResponse[] }>(
        '/transactions/transfer',
        input,
        { 'idempotency-key': key },
      );
      return transactions;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTransactionInput }) => {
      const { transaction } = await api.patch<{ transaction: TransactionResponse }>(
        `/transactions/${id}`,
        input,
      );
      return transaction;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true; removed: number }>(`/transactions/${id}`),
    onSuccess: invalidate,
  });
}
