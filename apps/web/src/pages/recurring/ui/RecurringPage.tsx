import { formatMoney, type RecurringRuleResponse } from '@moneymap/shared';
import { useState } from 'react';
import { categoryNameOrNull } from '@/entities/category';
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
import { cx, formatDate } from '@/shared/lib';
import { ROUTES } from '@/shared/config';
import { Alert, Button, Icon, SectionTabs, toast } from '@/shared/ui';
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

  // День крупно, месяц рубрикой под ним — как листок календаря: в списке
  // ближайших срабатываний дата важнее названия.
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const monthOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
      .format(new Date(`${iso}T00:00:00Z`))
      .replace('.', '');

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <SectionTabs
          tabs={[
            { to: ROUTES.transactions, label: t('nav.transactions') },
            { to: ROUTES.recurring, label: t('nav.recurring') },
          ]}
        />

        {/* Вторичная кнопка: лаймовая на экране одна, и это «Операция» в шапке. */}
        <Button variant="secondary" onClick={() => setForm('new')}>
          <Icon name="plus" className={styles.plus} />
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
                    {item.categoryKey && ` · ${categoryNameOrNull(t, item.categoryKey)}`}
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

      {/* Правила слева, ближайшие срабатывания справа — как лента и боковая
          колонка на главной. На узком экране блоки встают друг под друга. */}
      <div className={styles.columns}>
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
                    // Значки вместо трёх подписанных кнопок: «Изменить»,
                    // «Пауза» и «Удалить» в каждой строке занимали больше
                    // места, чем само правило. Название действия — в подсказке
                    // и для скринридера.
                    <>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setForm(rule)}
                        aria-label={t('recurring.edit')}
                        title={t('recurring.edit')}
                      >
                        <Icon name="pencil" className={styles.iconGlyph} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() =>
                          pause.mutate(
                            { id: rule.id, paused: !rule.isPaused },
                            { onError: () => toast.error(t('settings.saveFailed')) },
                          )
                        }
                        aria-label={t(rule.isPaused ? 'recurring.resume' : 'recurring.pause')}
                        title={t(rule.isPaused ? 'recurring.resume' : 'recurring.pause')}
                      >
                        <Icon
                          name={rule.isPaused ? 'play' : 'pause'}
                          className={styles.iconGlyph}
                        />
                      </button>
                      <button
                        type="button"
                        className={cx(styles.iconButton, styles.iconDanger)}
                        onClick={() =>
                          remove.mutate(rule.id, {
                            onSuccess: () => toast.success(t('recurring.deleted')),
                            onError: (error) => toast.error(t(error.message)),
                          })
                        }
                        aria-label={t('recurring.delete')}
                        title={t('recurring.delete')}
                      >
                        <Icon name="trash" className={styles.iconGlyph} />
                      </button>
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
                    <span className={styles.day}>{dayOf(item.dueOn)}</span>
                    <span className={styles.month}>{monthOf(item.dueOn)}</span>
                  </time>
                  <span className={styles.info}>
                    <span className={styles.name}>{item.ruleName}</span>
                    <span className={styles.meta}>{item.accountName}</span>
                  </span>
                  <span className={cx(styles.amount, item.kind === 'income' && styles.income)}>
                    {item.kind === 'expense' ? '−' : '+'}
                    {money(item.amount, item.currencyCode)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {form !== null && (
        <RecurringFormModal
          rule={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
