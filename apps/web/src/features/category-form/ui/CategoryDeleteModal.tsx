import type { CategoryResponse } from '@moneymap/shared';
import { useState } from 'react';
import { useT } from '@/shared/i18n';
import { Alert, Button, Modal, Select, toast } from '@/shared/ui';
import { useDeleteCategory } from '../api/use-category-mutations.ts';
import styles from './CategoryFormModal.module.scss';

interface CategoryDeleteModalProps {
  category: CategoryResponse;
  /** Куда можно перенести операции: категории того же вида, кроме этой. */
  targets: CategoryResponse[];
  onClose: () => void;
}

/**
 * Удаление категории с операциями требует решения, куда их деть (§8.4),
 * и спрашивать об этом надо до удаления, а не чинить последствия после.
 * У категории без операций решать нечего — диалог только подтверждает.
 */
export function CategoryDeleteModal({ category, targets, onClose }: CategoryDeleteModalProps) {
  const { t } = useT();
  const remove = useDeleteCategory();
  const [moveTo, setMoveTo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleDelete = async () => {
    setFormError(null);
    try {
      const result = await remove.mutateAsync({
        id: category.id,
        ...(moveTo === '' ? {} : { moveTo }),
      });
      toast.success(t('categories.deleted'));
      // Поднятые на верхний уровень дети — не то, что человек просил,
      // поэтому о перестройке дерева сообщаем отдельно.
      if (result.promotedChildren > 0) {
        toast.info(t('categories.promoted', { count: result.promotedChildren }));
      }
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'errors.requestFailed');
    }
  };

  return (
    <Modal open title={t('categories.deleteTitle', { name: category.name })} onClose={onClose}>
      <div className={styles.form}>
        {formError && <Alert>{t(formError)}</Alert>}

        {category.transactionCount > 0 && (
          <>
            <p className={styles.note}>
              {t('categories.deleteWithTransactions', { count: category.transactionCount })}
            </p>
            <Select
              label={t('categories.moveTo')}
              value={moveTo}
              onChange={(e) => setMoveTo(e.currentTarget.value)}
            >
              <option value="">{t('categories.moveToNone')}</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </Select>
          </>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            {t('categories.cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={remove.isPending}>
            {t('categories.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
