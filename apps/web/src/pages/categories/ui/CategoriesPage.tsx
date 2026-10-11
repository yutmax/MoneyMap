import { CATEGORY_KINDS, type CategoryKind, type CategoryResponse } from '@moneymap/shared';
import { useState } from 'react';
import { buildTree, CategoryRow, useCategories } from '@/entities/category';
import { CategoryDeleteModal, CategoryFormModal } from '@/features/category-form';
import { useT } from '@/shared/i18n';
import { Alert, Button } from '@/shared/ui';
import styles from './CategoriesPage.module.scss';

type FormState = null | { kind: CategoryKind; category?: CategoryResponse };

export function CategoriesPage() {
  const { t } = useT();
  const categories = useCategories();
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<CategoryResponse | null>(null);

  const all = categories.data ?? [];

  const actionsFor = (category: CategoryResponse) => (
    <>
      <Button
        variant="secondary"
        size="small"
        onClick={() => setForm({ kind: category.kind, category })}
      >
        {t('categories.edit')}
      </Button>
      <Button variant="danger" size="small" onClick={() => setDeleting(category)}>
        {t('categories.delete')}
      </Button>
    </>
  );

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('categories.title')}</h1>
          <p className={styles.subtitle}>{t('categories.subtitle')}</p>
        </div>
      </header>

      {categories.isError && <Alert>{t('categories.loadFailed')}</Alert>}

      {categories.isPending ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : (
        <div className={styles.trees}>
          {CATEGORY_KINDS.map((kind) => {
            const tree = buildTree(all, kind);

            return (
              <section key={kind} className={styles.tree}>
                <header className={styles.treeHeader}>
                  <h2 className={styles.treeTitle}>{t(`categories.${kind}`)}</h2>
                  <Button size="small" onClick={() => setForm({ kind })}>
                    {t('categories.create')}
                  </Button>
                </header>

                {tree.length === 0 ? (
                  <p className={styles.empty}>{t('categories.empty')}</p>
                ) : (
                  <ul className={styles.list}>
                    {tree.map((node) => (
                      <li key={node.category.id}>
                        <ul className={styles.group}>
                          <CategoryRow
                            category={node.category}
                            actions={actionsFor(node.category)}
                          />
                          {node.children.map((child) => (
                            <CategoryRow
                              key={child.id}
                              category={child}
                              nested
                              actions={actionsFor(child)}
                            />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {form !== null && (
        <CategoryFormModal
          {...(form.category ? { category: form.category } : {})}
          defaultKind={form.kind}
          // Вложить можно только в категорию верхнего уровня того же вида.
          parents={all.filter((c) => c.kind === form.kind && c.parentId === null)}
          onClose={() => setForm(null)}
        />
      )}

      {deleting !== null && (
        <CategoryDeleteModal
          category={deleting}
          targets={all.filter((c) => c.kind === deleting.kind && c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
