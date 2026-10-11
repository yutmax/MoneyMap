import type { MeResponse, OnboardingInput } from '@moneymap/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { userKeys } from '@/entities/user';
import { api } from '@/shared/api';

export function useCompleteOnboarding(): UseMutationResult<MeResponse, Error, OnboardingInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OnboardingInput) => {
      const { user } = await api.post<{ user: MeResponse }>('/onboarding', input);
      return user;
    },
    // Ответ уже содержит нового пользователя с onboardedAt — от этого поля
    // зависит гард маршрута, и лишний круг до сервера здесь означал бы
    // мигание экрана онбординга после успешной отправки.
    onSuccess: (user) => queryClient.setQueryData(userKeys.me, user),
  });
}
