import type { AccountResponse } from '@moneymap/shared';
import { useState } from 'react';
import { AccountCard, useAccounts } from '@/entities/account';
import { AccountFormModal, useDeleteAccount, useUpdateAccount } from '@/features/account-form';
import { useT } from '@/shared/i18n';
import { ROUTES } from '@/shared/config';
import { Alert, Button, Modal, SectionTabs, toast } from '@/shared/ui';
import styles from './AccountsPage.module.scss';

/** `null` — форма закрыта, `'new'` — создание, объект — правка. */
type FormState = null | 'new' | AccountResponse;

export function AccountsPage() {
  const { t } = useT();
  const accounts = useAccounts();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [form, setForm] = useState<FormState>(null);
  /** Счёт, удаление которого ждёт подтверждения. */
  const [pendingDelete, setPendingDelete] = useState<AccountResponse | null>(null);

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

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(t('accounts.deleted'));
        setPendingDelete(null);
      },
      onError: () => toast.error(t('accounts.deleteFailed')),
    });
  };

  const deleteButton = (account: AccountResponse) => (
    <Button variant="danger" size="small" onClick={() => setPendingDelete(account)}>
      {t('accounts.delete')}
    </Button>
  );

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
                      {deleteButton(account)}
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
                      <>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => toggleArchive(account)}
                        >
                          {t('accounts.unarchive')}
                        </Button>
                        {deleteButton(account)}
                      </>
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Удалить можно любой счёт, но счёт с историей уносит её с собой —
          поэтому сначала вопрос, и в нём сказано, что именно пропадёт. */}
      <Modal
        open={pendingDelete !== null}
        title={t('accounts.deleteTitle', { name: pendingDelete?.name ?? '' })}
        onClose={() => {
          if (!remove.isPending) setPendingDelete(null);
        }}
      >
        <div className={styles.confirm}>
          <p className={styles.confirmText}>
            {pendingDelete?.hasTransactions
              ? t('accounts.deleteWithHistory')
              : t('accounts.deleteEmpty')}
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="secondary"
              onClick={() => setPendingDelete(null)}
              disabled={remove.isPending}
            >
              {t('accounts.deleteCancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={remove.isPending}>
              {t('accounts.deleteConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {form !== null && (
        <AccountFormModal
          account={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
