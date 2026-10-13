import type { AccountResponse } from '@moneymap/shared';
import { useState } from 'react';
import { AccountCard, useAccounts } from '@/entities/account';
import { AccountFormModal, useDeleteAccount, useUpdateAccount } from '@/features/account-form';
import { useT } from '@/shared/i18n';
import { ROUTES } from '@/shared/config';
import { Alert, Button, SectionTabs, toast } from '@/shared/ui';
import styles from './AccountsPage.module.scss';

/** `null` — форма закрыта, `'new'` — создание, объект — правка. */
type FormState = null | 'new' | AccountResponse;

export function AccountsPage() {
  const { t } = useT();
  const accounts = useAccounts();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [form, setForm] = useState<FormState>(null);

  const toggleArchive = (account: AccountResponse) => {
    update.mutate(
      { id: account.id, input: { isArchived: !account.isArchived } },
      {
        onSuccess: () =>
          toast.success(
            t(account.isArchived ? 'accounts.unarchivedToast' : 'accounts.archivedToast'),
          ),
        onError: () => toast.error(t('settings.saveFailed')),
      },
    );
  };

  const handleDelete = (account: AccountResponse) => {
    remove.mutate(account.id, {
      onSuccess: () => toast.success(t('accounts.deleted')),
      // Счёт с операциями удалить нельзя — сервер отвечает 409 с объяснением,
      // и показать его точнее, чем общее «не получилось».
      onError: (error) => toast.error(t(error.message)),
    });
  };

  const list = accounts.data ?? [];
  const active = list.filter((a) => !a.isArchived);
  const archived = list.filter((a) => a.isArchived);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.subtitle}>{t('accounts.subtitle')}</p>
        </div>

        <SectionTabs
          tabs={[
            { to: ROUTES.accounts, label: t('nav.accounts') },
            { to: ROUTES.reconciliation, label: t('nav.reconciliation') },
          ]}
        />

        <Button size="small" onClick={() => setForm('new')}>
          {t('accounts.create')}
        </Button>
      </header>

      {accounts.isError && <Alert>{t('accounts.loadFailed')}</Alert>}

      {accounts.isPending ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : (
        <>
          {active.length === 0 && archived.length === 0 && (
            <p className={styles.empty}>{t('accounts.empty')}</p>
          )}

          {active.length > 0 && (
            <ul className={styles.list}>
              {active.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  actions={
                    <>
                      <Button variant="secondary" size="small" onClick={() => setForm(account)}>
                        {t('accounts.edit')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => toggleArchive(account)}
                      >
                        {t('accounts.archive')}
                      </Button>
                      {/* Удаление предлагается только там, где оно возможно:
                          кнопка, которая всегда отвечает отказом, — это
                          не защита, а ловушка. */}
                      {!account.hasTransactions && (
                        <Button variant="danger" size="small" onClick={() => handleDelete(account)}>
                          {t('accounts.delete')}
                        </Button>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('accounts.archivedSection')}</h2>
              <ul className={styles.list}>
                {archived.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    actions={
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => toggleArchive(account)}
                      >
                        {t('accounts.unarchive')}
                      </Button>
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {form !== null && (
        <AccountFormModal
          account={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
