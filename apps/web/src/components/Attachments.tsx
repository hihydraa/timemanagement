import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { ACCEPT, ALLOWED_EXT, extOf, fileIcon, formatBytes } from '../lib/files';
import { t } from '../lib/i18n';
import type { Attachment, StorageInfo } from '../lib/types';

interface Props {
  /** งานที่มีอยู่แล้ว = อัปโหลดทันที; null = งานใหม่ เก็บไฟล์ไว้รออัปโหลดหลังบันทึก */
  taskId: string | null;
  pending: File[];
  onPendingChange: (files: File[]) => void;
  /** เรียกเมื่อรายการไฟล์ของงานที่มีอยู่เปลี่ยน (ให้ปฏิทินอัปเดตไอคอน 📎) */
  onChanged: () => void;
}

export default function Attachments({ taskId, pending, onPendingChange, onChanged }: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        api.storage(),
        taskId ? api.listAttachments(taskId) : Promise.resolve([]),
      ]);
      setStorage(s);
      setItems(list);
    } catch {
      /* แสดงเงียบ ๆ: ฟอร์มยังใช้งานได้ */
    }
  }, [taskId]);

  useEffect(() => void reload(), [reload]);

  function validate(files: File[]): string | null {
    const maxFiles = storage?.maxFiles ?? 5;
    if (files.length > maxFiles) return `${t.attach.tooMany} ${maxFiles} ${t.attach.files}`;
    for (const f of files) {
      if (!ALLOWED_EXT.includes(extOf(f.name))) return `${t.attach.unsupported}: ${f.name}`;
      if (storage && f.size > storage.maxFileBytes) {
        return `${t.attach.tooLarge} ${formatBytes(storage.maxFileBytes)}: ${f.name}`;
      }
    }
    return null;
  }

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    setError('');
    const problem = validate(files);
    if (problem) return setError(problem);
    if (!taskId) {
      onPendingChange([...pending, ...files]);
      return;
    }
    setBusy(true);
    try {
      await api.uploadAttachments(taskId, files);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`${t.attach.confirmRemove}\n${a.filename}`)) return;
    setBusy(true);
    try {
      await api.deleteAttachment(a.id);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const pct = storage ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100) : 0;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {t.attach.title}
      </legend>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-3 text-center text-sm ${dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-300 dark:border-slate-600'}`}
      >
        <span className="text-slate-600 dark:text-slate-300">{t.attach.drop} </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="font-medium text-indigo-600 underline dark:text-indigo-400"
        >
          {t.attach.choose}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={t.attach.choose}
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.attach.hint}</p>
        {busy && (
          <p role="status" className="mt-1 text-xs text-indigo-600">
            {t.attach.uploading}
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <ul className="space-y-1">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded border border-slate-200 p-1.5 text-sm dark:border-slate-700"
          >
            {a.isImage ? (
              <img
                src={`/api/attachments/${a.id}`}
                alt=""
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl"
              >
                {fileIcon(a.filename)}
              </span>
            )}
            <a
              href={`/api/attachments/${a.id}`}
              download={a.filename}
              className="min-w-0 flex-1 truncate text-indigo-700 hover:underline dark:text-indigo-300"
              title={`${t.attach.download}: ${a.filename}`}
            >
              {a.filename}
              <span className="ml-1 text-xs text-slate-500">{formatBytes(a.sizeBytes)}</span>
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(a)}
              aria-label={`${t.attach.remove}: ${a.filename}`}
              className="rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </li>
        ))}
        {pending.map((f, i) => (
          <li
            key={`${f.name}-${i}`}
            className="flex items-center gap-2 rounded border border-dashed border-slate-300 p-1.5 text-sm dark:border-slate-600"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl"
            >
              {fileIcon(f.name)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {f.name}
              <span className="ml-1 text-xs text-slate-500">
                {formatBytes(f.size)} · {t.attach.pendingNote}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
              aria-label={`${t.attach.remove}: ${f.name}`}
              className="rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </li>
        ))}
        {taskId && items.length === 0 && pending.length === 0 && (
          <li className="text-xs text-slate-500 dark:text-slate-400">{t.attach.none}</li>
        )}
      </ul>

      {storage && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t.attach.storage}: {formatBytes(storage.usedBytes)} / {formatBytes(storage.quotaBytes)}
          <div
            className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.attach.storage}
          >
            <div
              className={`h-full ${pct > 90 ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}
