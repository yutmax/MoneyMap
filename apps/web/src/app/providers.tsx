import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/api/client.ts';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Данные считаются свежими 30 секунд: баланс не меняется сам,
        // меняется он от действий пользователя, а они инвалидируют кеш явно.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // 4xx повторять бессмысленно: ответ не изменится от повтора.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Мутации не повторяются автоматически: повтор создания операции —
        // это дубль в учёте. Идемпотентность появится вместе с транзакциями
        // (Idempotency-Key, §8.3), до тех пор — только ручной повтор.
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // useState, а не модульная константа: иначе в тестах и при HMR клиент
  // переживает размонтирование приложения вместе со своим кешем.
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
