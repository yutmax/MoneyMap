import { formatMoney, isNegative, isZero, parseUserAmount, todayIn } from '@moneymap/shared';
import { useState } from 'react';
import { useCurrencies } from '@/entities/currency';
import { useReconciliationAccounts, useSnapshots } from '@/entities/reconciliation';
import { useMe } from '@/entities/user';
import { useCorrectSnapshot, useCreateSnapshot } from '@/features/reconciliation';
import { useT } from '@/shared/i18n';
import { cx, formatDate } from '@/shared/lib';
import { ROUTES } from '@/shared/config';
import { Alert, Button, Field, SectionTabs, toast } from '@/shared/ui';
import styles from './ReconciliationPage.module.scss';

/**
 * Сверка остатков (§8.8).
 *
 * Человек вводит то, что видит в банке, приложение показывает, насколько
 * это расходится с его расчётом. Расхождение — не ошибка приложения,
 * а признак незафиксированной операции, и закрыть его можно одним
 * действием, создав ту самую операцию.
 */
export function ReconciliationPage() {
  const { t, locale } = useT();
  const { user } = useMe();
  const accounts = useReconciliationAccounts();
  const snapshots = useSnapshots();
  const currencies = useCurrencies();
  const create = useCreateSnapshot();
  const correct = useCorrectSnapshot();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const today = todayIn(user?.timezone ?? 'UTC');

  const money = (amount: string, code: string) => {
    const currency = currencies.data?.find((c) => c.code === code);
    return formatMoney(amount, {
      currency: code,
      decimals: currency?.decimals ?? 2,
      locale,
      ...(currency?.symbol ? { symbol: currency.symbol } : {}),
    });
  };

  const check = (accountId: string) => {
    const draft = drafts[accountId] ?? '';
    let reported: string;
    try {
      reported = parseUserAmount(draft);
    } catch {
      toast.error(t('validation.money.format'));
      return;
    }

    create.mutate(
      { accountId, asOf: today, reportedAmount: reported },
      {
        onSuccess: (snapshot) => {
          setDrafts((prev) => ({ ...prev, [accountId]: '' }));
          toast.success(
            isZero(snapshot.difference)
              ? t('reconciliation.matched')
              : t('reconciliation.gap', {
                  amount: money(snapshot.difference, snapshot.currencyCode),
                }),
          );
        },
        onError: (error) => toast.error(t(error.message)),
      },
    );
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('reconciliation.title')}</h1>
          <p className={styles.subtitle}>{t('reconciliation.subtitle')}</p>
        </div>

        <SectionTabs
          tabs={[
            { to: ROUTES.accounts, label: t('nav.accounts') },
            { to: ROUTES.reconciliation, label: t('nav.reconciliation') },
          ]}
        />
      </header>

      {accounts.isError && <Alert>{t('reconciliation.loadFailed')}</Alert>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('reconciliation.accountsTitle')}</h2>
        <ul className={styles.list}>
          {(accounts.data ?? []).map((row) => (
            <li key={row.accountId} className={styles.account}>
              <div className={styles.info}>
                <p className={styles.name}>{row.accountName}</p>
                <p className={styles.meta}>
                  {t('reconciliation.computed', {
                    amount: money(row.computedAmount, row.currencyCode),
                  })}
                  {row.lastCheckedOn &&
                    ` · ${t('reconciliation.lastChecked', {
                      when: formatDate(row.lastCheckedOn, locale),
                    })}`}
                </p>
              </div>

              <div className={styles.entry}>
                <Field
                  label={t('reconciliation.reported', { currency: row.currencyCode })}
                  inputMode="decimal"
                  value={drafts[row.accountId] ?? ''}
                  onChange={(e) => {
                    // Значение читается до setState, а не внутри него:
                    // функция-обновитель вызывается уже на рендере, когда
                    // React обнулил currentTarget события, и чтение там
                    // роняет страницу целиком.
                    const value = e.currentTarget.value;
                    setDrafts((prev) => ({ ...prev, [row.accountId]: value }));
                  }}
                />
                <Button
                  size="small"
                  disabled={!drafts[row.accountId]}
                  onClick={() => check(row.accountId)}
                >
                  {t('reconciliation.check')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {(accounts.data?.length ?? 0) === 0 && !accounts.isPending && (
          <p className={styles.empty}>{t('reconciliation.noAccounts')}</p>
        )}
      </section>

      {(snapshots.data?.length ?? 0) > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('reconciliation.historyTitle')}</h2>
          <ul className={styles.list}>
            {snapshots.data?.map((snapshot) => {
              const matched = isZero(snapshot.difference);
              return (
                <li key={snapshot.id} className={styles.snapshot}>
                  <div className={styles.info}>
                    <p className={styles.name}>
                      {snapshot.accountName}
                      <span className={styles.date}>{formatDate(snapshot.asOf, locale)}</span>
                    </p>
                    <p className={styles.meta}>
                      {t('reconciliation.reportedShort', {
                        amount: money(snapshot.reportedAmount, snapshot.currencyCode),
                      })}
                      {' · '}
                      {t('reconciliation.computedShort', {
                        amount: money(snapshot.computedAmount, snapshot.currencyCode),
                      })}
                      {snapshot.note && ` · ${snapshot.note}`}
                    </p>
                  </div>

                  <p
                    className={cx(
                      styles.difference,
                      matched
                        ? styles.matched
                        : isNegative(snapshot.difference)
                          ? styles.short
                          : styles.over,
                    )}
                  >
                    {matched
                      ? t('reconciliation.matchedShort')
                      : money(snapshot.difference, snapshot.currencyCode)}
                  </p>

                  {/* Закрыть расхождение предлагается только там, где есть что
                      закрывать: кнопка, всегда отвечающая отказом, — ловушка. */}
                  {!matched && !snapshot.correctionId && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() =>
                        correct.mutate(snapshot.id, {
                          onSuccess: () => toast.success(t('reconciliation.corrected')),
                          onError: (error) => toast.error(t(error.message)),
                        })
                      }
                    >
                      {t('reconciliation.correct')}
                    </Button>
                  )}
                  {snapshot.correctionId && (
                    <span className={styles.badge}>{t('reconciliation.closed')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
