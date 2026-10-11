import type { ImportMapping, ImportPreview, ImportResult } from '@moneymap/shared';
import { useState } from 'react';
import { useAccounts } from '@/entities/account';
import { useT } from '@/shared/i18n';
import { Alert, Button, Modal, Select, toast } from '@/shared/ui';
import { useImportCsv, usePreviewCsv } from '../api/use-import.ts';
import styles from './ImportModal.module.scss';

interface ImportModalProps {
  onClose: () => void;
}

type Field = keyof ImportMapping;
const FIELDS: Field[] = ['date', 'amount', 'note', 'category'];

/**
 * Импорт выписки (§8.11).
 *
 * Сначала предпросмотр, потом запись: человек видит, как разобрался файл,
 * и правит сопоставление колонок до того, как что-то попадёт в учёт.
 * Файл читает браузер и шлёт текстом — серверу не нужен разбор
 * multipart ради одного поля.
 */
export function ImportModal({ onClose }: ImportModalProps) {
  const { t } = useT();
  const accounts = useAccounts();
  const preview = usePreviewCsv();
  const run = useImportCsv();

  const [csv, setCsv] = useState('');
  const [data, setData] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [accountId, setAccountId] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (accounts.data ?? []).filter((a) => !a.isArchived);
  const selectedAccountId = accountId || open[0]?.id || '';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);

    const text = await file.text();
    setCsv(text);

    preview.mutate(text, {
      onSuccess: (response) => {
        setData(response);
        setMapping({
          date: response.suggested.date ?? 0,
          amount: response.suggested.amount ?? 1,
          note: response.suggested.note,
          category: response.suggested.category,
        });
      },
      onError: (err) => setError(err.message),
    });
  };

  const submit = () => {
    if (!mapping || !data) return;
    setError(null);

    run.mutate(
      { csv, accountId: selectedAccountId, mapping, delimiter: data.delimiter },
      {
        onSuccess: (response) => {
          setResult(response);
          if (response.imported > 0) toast.success(t('import.done', { count: response.imported }));
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <Modal open title={t('import.title')} onClose={onClose}>
      <div className={styles.root}>
        {error && <Alert>{t(error)}</Alert>}

        <label className={styles.file}>
          <span className={styles.fileLabel}>{t('import.file')}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onFile(event.currentTarget.files?.[0])}
          />
          <span className={styles.hint}>{t('import.fileHint')}</span>
        </label>

        {data && mapping && (
          <>
            <Select
              label={t('transactions.account')}
              value={selectedAccountId}
              onChange={(e) => setAccountId(e.currentTarget.value)}
            >
              {open.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currencyCode}
                </option>
              ))}
            </Select>

            <div className={styles.mapping}>
              {FIELDS.map((field) => (
                <Select
                  key={field}
                  label={t(`import.field.${field}`)}
                  value={mapping[field] === null ? '' : String(mapping[field])}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    setMapping({ ...mapping, [field]: raw === '' ? null : Number(raw) });
                  }}
                >
                  {/* Дата и сумма обязательны — без них строка не операция. */}
                  {(field === 'note' || field === 'category') && (
                    <option value="">{t('import.noColumn')}</option>
                  )}
                  {data.columns.map((name, index) => (
                    <option key={`${name}-${index}`} value={index}>
                      {name || t('import.column', { index: index + 1 })}
                    </option>
                  ))}
                </Select>
              ))}
            </div>

            <div className={styles.previewWrap}>
              <table className={styles.preview}>
                <thead>
                  <tr>
                    {data.columns.map((name, index) => (
                      <th key={`${name}-${index}`}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {data.columns.map((_, cellIndex) => (
                        <td key={cellIndex}>{row[cellIndex] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className={styles.hint}>{t('import.rows', { count: data.total })}</p>
          </>
        )}

        {result && (
          <Alert>
            {t('import.result', {
              imported: result.imported,
              duplicates: result.duplicates,
              failed: result.failed.length,
            })}
            {result.failed.length > 0 && (
              <span className={styles.hint}>
                {t('import.failedRows', { rows: result.failed.slice(0, 10).join(', ') })}
              </span>
            )}
          </Alert>
        )}

        <Button
          block
          disabled={!data || !mapping}
          loading={preview.isPending || run.isPending}
          onClick={submit}
        >
          {t('import.submit')}
        </Button>
      </div>
    </Modal>
  );
}
