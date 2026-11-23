import type { AccountResponse } from '@moneymap/shared';
import { useState } from 'react';
import { AccountCard, useAccounts } from '@/entities/account';
import { AccountFormModal } from '@/features/account-form';
import { useT } from '@/shared/i18n';
import { ROUTES } from '@/shared/config';
import { Alert, Button, SectionTabs } from '@/shared/ui';
import styles from './AccountsPage.module.scss';

/** `null` — форма закрыта, `'new'` — создание, объект — открытый счёт. */
type FormState = null | 'new' | AccountResponse;

/**
 * Счета. Действующие одним списком, архив — отдельным под ним.
 *
 * Счёт открывается нажатием на строку: в окне и правка, и архив, и
 * удаление. Отдельного окна подтверждения удаления больше нет — вопрос
 * задаётся там же, где нажали «Удалить», и в нём сказано, что пропадёт.
 */
export function AccountsPage() {
  const { t } = useT();
  const accounts = useAccounts();
  const [form, setForm] = useState<FormState>(null);

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
        <div className={styles.skeleton} aria-busy="true" />
      ) : (
        <>
          {active.length === 0 && archived.length === 0 && (
            <p className={styles.empty}>{t('accounts.empty')}</p>
          )}

          {active.length > 0 && (
            <ul className={styles.list}>
              {active.map((account) => (
                <AccountCard key={account.id} account={account} onOpen={setForm} />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('accounts.archivedSection')}</h2>
              <ul className={styles.list}>
                {archived.map((account) => (
                  <AccountCard key={account.id} account={account} onOpen={setForm} />
                ))}
              </ul>
            </section>
          )}
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
