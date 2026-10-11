import { formatMoney, type RecurringRuleResponse } from '@moneymap/shared';
import { useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import {
  RecurringRuleCard,
  usePendingOccurrences,
  useRecurringRules,
  useUpcoming,
} from '@/entities/recurring';
import {
  RecurringFormModal,
  useConfirmOccurrence,
  useDeleteRecurringRule,
  usePauseRecurringRule,
  useSkipOccurrence,
} from '@/features/recurring-form';
import { useT } from '@/shared/i18n';
import { formatDate } from '@/shared/lib';
import { ROUTES } from '@/shared/config';
import { Alert, Button, SectionTabs, toast } from '@/shared/ui';
import styles from './RecurringPage.module.scss';

/** `null` — форма закрыта, `'new'` — создание, объект — правка. */
type FormState = null | 'new' | RecurringRuleResponse;

const UPCOMING_DAYS = 30;

export function RecurringPage() {
  const { t, locale } = useT();
  const rules = useRecurringRules();
  const pending = usePendingOccurrences();
  const upcoming = useUpcoming(UPCOMING_DAYS);
  const currencies = useCurrencies();
  const pause = usePauseRecurringRule();
  const remove = useDeleteRecurringRule();
  const confirm = useConfirmOccurrence();
  const skip = useSkipOccurrence();
  const [form, setForm] = useState<FormState>(null);

  const money = (amount: string, code: string) => {
    const currency = currencies.data?.find((c) => c.code === code);
    return formatMoney(amount, {
      currency: code,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });
  };

  const list = rules.data ?? [];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('recurring.title')}</h1>
          <p className={styles.subtitle}>{t('recurring.subtitle')}</p>
        </div>

        <SectionTabs
          tabs={[
            { to: ROUTES.transactions, label: t('nav.transactions') },
            { to: ROUTES.recurring, label: t('nav.recurring') },
          ]}
        />

        <Button size="small" onClick={() => setForm('new')}>
          {t('recurring.create')}
        </Button>
      </header>

      {rules.isError && <Alert>{t('recurring.loadFailed')}</Alert>}

      {/* Очередь подтверждений стоит первой: это единственное здесь, что
          ждёт решения, а не просто сообщает о себе. */}
      {(pending.data?.length ?? 0) > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('recurring.pendingTitle')}</h2>
          <ul className={styles.list}>
            {pending.data?.map((item) => (
              <li key={item.id} className={styles.pending}>
                <div className={styles.info}>
                  <p className={styles.name}>{item.ruleName}</p>
                  <p className={styles.meta}>
                    {formatDate(item.dueOn, locale)} · {item.accountName}
                    {item.categoryName && ` · ${item.categoryName}`}
                  </p>
                </div>
                <p className={styles.amount}>
                  {item.kind === 'expense' ? '−' : '+'}
                  {money(item.amount, item.currencyCode)}
                </p>
                <div className={styles.actions}>
                  <Button
                    size="small"
                    onClick={() =>
                      confirm.mutate(item.id, {
                        onSuccess: () => toast.success(t('recurring.confirmed')),
                        onError: (error) => toast.error(t(error.message)),
                      })
                    }
                  >
                    {t('recurring.confirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() =>
                      skip.mutate(item.id, {
                        onSuccess: () => toast.success(t('recurring.skipped')),
                        onError: (error) => toast.error(t(error.message)),
                      })
                    }
                  >
                    {t('recurring.skip')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('recurring.rulesTitle')}</h2>

        {rules.isPending ? (
          <ul className={styles.list} aria-busy="true">
            {[0, 1].map((i) => (
              <li key={i} className={styles.skeleton} />
            ))}
          </ul>
        ) : list.length === 0 ? (
          <p className={styles.empty}>{t('recurring.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {list.map((rule) => (
              <RecurringRuleCard
                key={rule.id}
                rule={rule}
                actions={
                  <>
                    <Button variant="secondary" size="small" onClick={() => setForm(rule)}>
                      {t('recurring.edit')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() =>
                        pause.mutate(
                          { id: rule.id, paused: !rule.isPaused },
                          { onError: () => toast.error(t('settings.saveFailed')) },
                        )
                      }
                    >
                      {t(rule.isPaused ? 'recurring.resume' : 'recurring.pause')}
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() =>
                        remove.mutate(rule.id, {
                          onSuccess: () => toast.success(t('recurring.deleted')),
                          onError: (error) => toast.error(t(error.message)),
                        })
                      }
                    >
                      {t('recurring.delete')}
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {(upcoming.data?.length ?? 0) > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t('recurring.upcomingTitle', { days: UPCOMING_DAYS })}
          </h2>
          <ul className={styles.upcoming}>
            {upcoming.data?.map((item) => (
              <li key={`${item.ruleId}-${item.dueOn}`} className={styles.upcomingRow}>
                <time className={styles.date} dateTime={item.dueOn}>
                  {formatDate(item.dueOn, locale)}
                </time>
                <span className={styles.upcomingName}>{item.ruleName}</span>
                <span className={styles.amount}>
                  {item.kind === 'expense' ? '−' : '+'}
                  {money(item.amount, item.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {form !== null && (
        <RecurringFormModal
          rule={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
