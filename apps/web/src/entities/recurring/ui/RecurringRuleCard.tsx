import { formatMoney, type RecurringRuleResponse } from '@moneymap/shared';
import type { ReactNode } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { scheduleText } from '../lib/schedule-text.ts';
import styles from './RecurringRuleCard.module.scss';

interface RecurringRuleCardProps {
  rule: RecurringRuleResponse;
  /** Кнопки приходят снаружи: действия живут в features. */
  actions?: ReactNode;
}

export function RecurringRuleCard({ rule, actions }: RecurringRuleCardProps) {
  const { t, locale } = useT();
  const currencies = useCurrencies();
  const currency = currencies.data?.find((c) => c.code === rule.currencyCode);

  const amount = formatMoney(rule.amount, {
    currency: rule.currencyCode,
    decimals: currency?.decimals ?? 2,
    locale,
    ...(currency?.symbol ? { symbol: currency.symbol } : {}),
  });

  return (
    <li className={cx(styles.root, rule.isPaused && styles.paused)}>
      <div className={styles.info}>
        <p className={styles.name}>
          {rule.name}
          {rule.isPaused && <span className={styles.badge}>{t('recurring.paused')}</span>}
          {/* Подтверждение вручную — не настройка, а обещание спросить,
              и о нём стоит сказать прямо в списке. */}
          {!rule.autoPost && <span className={styles.badge}>{t('recurring.manual')}</span>}
        </p>
        <p className={styles.meta}>
          {scheduleText(rule, t, locale)} · {rule.accountName}
          {rule.categoryName && ` · ${rule.categoryName}`}
        </p>
        <p className={styles.meta}>
          {rule.nextOccurrenceOn && !rule.isPaused
            ? t('recurring.next', { when: formatDate(rule.nextOccurrenceOn, locale) })
            : t('recurring.noNext')}
        </p>
      </div>

      <p className={cx(styles.amount, rule.kind === 'expense' ? styles.expense : styles.income)}>
        {rule.kind === 'expense' ? '−' : '+'}
        {amount}
      </p>

      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
