import { formatMoney, isNegative, type AccountResponse } from '@moneymap/shared';
import { useState } from 'react';
import { AccountCard, useAccounts } from '@/entities/account';
import { useCurrencies } from '@/entities/currency';
import { useSummary } from '@/entities/summary';
import { AccountFormModal } from '@/features/account-form';
import { ROUTES } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib';
import { Alert, Button, Icon, SectionTabs, seriesColor, StackedBar } from '@/shared/ui';
import styles from './AccountsPage.module.scss';

type FormState = null | 'new' | AccountResponse;

/**
 * Счета: сводка сверху, под ней карточки.
 *
 * Сводка отвечает на вопрос, которого на странице раньше не было вовсе, —
 * «сколько всего и в каких валютах». Список счетов без неё был перечнем
 * остатков, которые надо складывать в уме, да ещё и в разных валютах.
 *
 * Кнопок в карточке нет: нажатие открывает окно счёта с правкой, архивом и
 * удалением. Валюта задаётся при создании и потом не меняется (§8.2).
 */
export function AccountsPage() {
  const { t, locale } = useT();
  const accounts = useAccounts();
  const summary = useSummary();
  const currencies = useCurrencies();
  const [form, setForm] = useState<FormState>(null);

  const list = accounts.data ?? [];
  const active = list.filter((a) => !a.isArchived);
  const archived = list.filter((a) => a.isArchived);

  const data = summary.data;
  const base = data?.baseCurrency ?? '';
  const money = (amount: string, code: string) => {
    const meta = currencies.data?.find((item) => item.code === code);
    return formatMoney(amount, {
      currency: code,
      decimals: meta?.decimals ?? 2,
      locale,
      ...(meta?.symbol ? { symbol: meta.symbol } : {}),
    });
  };

  const shareOf = (id: string) => data?.byAccount.find((item) => item.accountId === id)?.share;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <SectionTabs
          tabs={[
            { to: ROUTES.accounts, label: t('nav.accounts') },
            { to: ROUTES.reconciliation, label: t('nav.reconciliation') },
          ]}
        />

        {/* Вторичная кнопка: лаймовая на экране одна, и это «Операция» в шапке. */}
        <Button variant="secondary" onClick={() => setForm('new')}>
          <Icon name="plus" className={styles.plus} />
          {t('accounts.create')}
        </Button>
      </header>

      {accounts.isError && <Alert>{t('accounts.loadFailed')}</Alert>}

      {accounts.isPending ? (
        <div className={styles.skeleton} aria-busy="true" />
      ) : (
        <>
          {active.length === 0 && archived.length === 0 && (
            <p className={styles.empty}>{t('accounts.empty')}</p>
          )}

          {data && active.length > 0 && (
            <section className={styles.summary} aria-labelledby="accounts-total-title">
              <div className={styles.summaryHead}>
                <h2 className={styles.eyebrow} id="accounts-total-title">
                  {t('summary.title')}
                </h2>
                <span className={styles.count}>
                  {t('accounts.count', { count: active.length })}
                </span>
              </div>
              <p className={cx(styles.total, isNegative(data.total) && styles.negative)}>
                {money(data.total, base)}
              </p>
              {data.byCurrency.length > 0 && (
                <StackedBar
                  segments={data.byCurrency.map((bucket, index) => ({
                    key: bucket.currencyCode,
                    label: bucket.currencyCode,
                    share: bucket.share,
                    // В легенде валюта показана в себе самой: «2 370,57 Br»
                    // человек узнаёт, а пересчёт стоит рядом в итоге.
                    value: money(bucket.total, bucket.currencyCode),
                    color: seriesColor(index),
                    negative: isNegative(bucket.totalBase),
                  }))}
                />
              )}
            </section>
          )}

          {active.length > 0 && (
            <ul className={styles.grid}>
              {active.map((account, index) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  color={seriesColor(index)}
                  share={shareOf(account.id)}
                  onOpen={setForm}
                />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('accounts.archivedSection')}</h2>
              <ul className={styles.grid}>
                {archived.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    color="var(--c-text-muted)"
                    onOpen={setForm}
                  />
                ))}
              </ul>
            </section>
          )}

          <p className={styles.subtitle}>{t('accounts.subtitle')}</p>
        </>
      )}

      {form !== null && (
        <AccountFormModal
          {...(form === 'new' ? {} : { account: form })}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
