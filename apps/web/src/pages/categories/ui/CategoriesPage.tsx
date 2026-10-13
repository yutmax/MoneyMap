import { CATEGORY_KINDS } from '@moneymap/shared';
import { buildTree, CategoryRow, useCategories } from '@/entities/category';
import { useT } from '@/shared/i18n';
import { Alert } from '@/shared/ui';
import styles from './CategoriesPage.module.scss';

/**
 * Список категорий (§8.4).
 *
 * Страница только показывает: набор задан разработчиком, завести свою
 * категорию, переименовать или удалить нельзя. Кнопок нет совсем — вместо
 * отключённых, которые обещали бы действие, которого не будет.
 */
export function CategoriesPage() {
  const { t } = useT();
  const categories = useCategories();

  const all = categories.data ?? [];

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
                </header>

                {tree.length === 0 ? (
                  <p className={styles.empty}>{t('categories.empty')}</p>
                ) : (
                  <ul className={styles.list}>
                    {tree.map((node) => (
                      <li key={node.category.id}>
                        <ul className={styles.group}>
                          <CategoryRow category={node.category} />
                          {node.children.map((child) => (
                            <CategoryRow key={child.id} category={child} nested />
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
    </div>
  );
}
