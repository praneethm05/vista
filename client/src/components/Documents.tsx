import { useState } from 'react';
import { useApi } from '../lib/api';
import type { DocMeta } from '../lib/types';

/** Lists attached documents; opens them with the auth token (they are not public URLs). */
export function DocumentList({ docs }: { docs: DocMeta[] }) {
  const api = useApi();
  const [opening, setOpening] = useState<string | null>(null);
  if (docs.length === 0) return <p className="text-small text-muted">No documents attached.</p>;
  async function open(doc: DocMeta) {
    setOpening(doc._id);
    try {
      const blob = await api<Blob>(`/documents/${doc._id}`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } finally {
      setOpening(null);
    }
  }
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li key={d._id}>
          <button onClick={() => open(d)} className="flex w-full items-center gap-3 rounded-control border border-line px-3 py-2.5 text-left hover:bg-brand-tint">
            <span className="grid size-8 place-items-center rounded-md bg-accent-tint text-tiny font-bold text-accent">{d.mimeType.includes('pdf') ? 'PDF' : 'IMG'}</span>
            <span className="min-w-0 flex-1 truncate text-small font-medium">{d.filename}</span>
            <span className="text-tiny text-muted">{opening === d._id ? 'Opening…' : `${Math.max(1, Math.round(d.size / 1024))} KB`}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** File picker that uploads immediately and reports the new document ids. */
export function DocumentUpload({ value, onChange }: { value: DocMeta[]; onChange: (docs: DocMeta[]) => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const added: DocMeta[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const doc = await api<{ id: string; filename: string; mimeType: string; size: number }>('/documents', { method: 'POST', body: form });
        added.push({ _id: doc.id, filename: doc.filename, mimeType: doc.mimeType, size: doc.size });
      }
      onChange([...value, ...added]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-control border-2 border-dashed border-brand/30 bg-brand-tint/40 px-4 py-5 text-center hover:bg-brand-tint">
        <span className="text-small font-semibold text-brand">{busy ? 'Uploading…' : 'Choose a file'}</span>
        <span className="text-tiny text-muted">PDF, PNG or JPG · up to 5 MB</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {error && <p className="text-small text-danger">{error}</p>}
      {value.map((d) => (
        <div key={d._id} className="flex items-center justify-between rounded-control border border-line px-3 py-2 text-small">
          <span className="truncate">📎 {d.filename}</span>
          <button type="button" className="text-tiny font-semibold text-danger" onClick={() => onChange(value.filter((x) => x._id !== d._id))}>Remove</button>
        </div>
      ))}
    </div>
  );
}
