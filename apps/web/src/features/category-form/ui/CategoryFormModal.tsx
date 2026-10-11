import {
  CATEGORY_KINDS,
  createCategorySchema,
  type CategoryResponse,
  type CategoryKind,
} from '@moneymap/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useT } from '@/shared/i18n';
import { applyServerError } from '@/shared/lib';
import { Alert, Button, Field, Modal, Select, toast } from '@/shared/ui';
import { useCreateCategory, useUpdateCategory } from '../api/use-category-mutations.ts';
import styles from './CategoryFormModal.module.scss';

type FormValues = z.input<typeof createCategorySchema>;

interface CategoryFormModalProps {
  category?: CategoryResponse;
  /** Вид для новой категории: открыли из дерева доходов или расходов. */
  defaultKind: CategoryKind;
  /** Категории верхнего уровня — только в них можно вложить. */
  parents: CategoryResponse[];
  onClose: () => void;
}

export function CategoryFormModal({
  category,
  defaultKind,
  parents,
  onClose,
}: CategoryFormModalProps) {
  const { t } = useT();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = category !== undefined;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: category?.name ?? '',
      kind: category?.kind ?? defaultKind,
      parentId: category?.parentId ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // Пустая строка из select — это «без родителя», а не отсутствие поля.
    const parentId = values.parentId === '' ? null : (values.parentId ?? null);

    try {
      if (isEdit) {
        await update.mutateAsync({ id: category.id, input: { name: values.name, parentId } });
        toast.success(t('categories.updated'));
      } else {
        await create.mutateAsync({ name: values.name, kind: values.kind, parentId });
        toast.success(t('categories.created'));
      }
      onClose();
    } catch (error) {
      setFormError(applyServerError(error, setError, ['name', 'kind', 'parentId']));
    }
  });

  // Себя в родители не предлагаем, и категорию с детьми — тоже: третьего
  // уровня в модели нет.
  const available = parents.filter((p) => p.id !== category?.id);

  return (
    <Modal
      open
      title={isEdit ? t('categories.editTitle') : t('categories.createTitle')}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert>{t(formError)}</Alert>}

        <div className={styles.fields}>
          <Field
            label={t('categories.name')}
            autoFocus
            error={t(errors.name?.message)}
            {...register('name')}
          />

          {/* Вид меняться не может: он определяет знак всей истории
              категории. Для другого вида заводят другую категорию. */}
          <Select
            label={t('categories.kind')}
            disabled={isEdit}
            error={t(errors.kind?.message)}
            {...register('kind')}
          >
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`categories.${kind}`)}
              </option>
            ))}
          </Select>

          <Select
            label={t('categories.parent')}
            hint={t('categories.parentHint')}
            error={t(errors.parentId?.message)}
            {...register('parentId')}
          >
            <option value="">{t('categories.parentNone')}</option>
            {available.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" block loading={isSubmitting}>
          {isEdit ? t('categories.save') : t('categories.create')}
        </Button>
      </form>
    </Modal>
  );
}
