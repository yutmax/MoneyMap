import { useT } from '@/shared/i18n';
import { Modal } from '@/shared/ui';
import { OnboardingForm } from './OnboardingForm.tsx';

/**
 * Первичная настройка поверх приложения, а не отдельной страницей.
 *
 * Так человек сразу видит, куда попал, и ради чего отвечает на два вопроса,
 * — в отличие от формы на пустом экране, которая выглядит продолжением
 * регистрации. Окно закрыть нельзя: без базовой валюты и таймзоны приложению
 * нечем считать, поэтому onClose не передаётся.
 */
export function OnboardingModal({ name }: { name?: string }) {
  const { t } = useT();

  return (
    <Modal
      open
      title={name ? t('onboarding.title', { name }) : t('onboarding.titleFallback')}
      subtitle={t('onboarding.subtitle')}
    >
      <OnboardingForm />
    </Modal>
  );
}
