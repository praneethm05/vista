import { useEffect, useState } from 'react';
import { ApiError, useApi, useQuery } from '../lib/api';
import type { LeaveType } from '../lib/types';
import { Alert, ErrorState, PageHeader, Spinner } from '../components/ui';

interface Policy { longLeaveThresholdDays: number; cancelNoticeDays: number; quotas: Record<string, number | null> }

/** System admin: tune the leave policy without a code change. Every save is audited. */
export function SettingsPage() {
  const api = useApi();
  const policy = useQuery<Policy>('/settings');
  const types = useQuery<{ types: LeaveType[] }>('/leave-types');
  const [form, setForm] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => { if (policy.data) setForm(policy.data); }, [policy.data]);

  if (policy.error) return <ErrorState message={policy.error.message} onRetry={policy.reload} />;
  if (!form || !types.data) return <Spinner />;

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const quotas = Object.fromEntries(Object.entries(form!.quotas).filter(([, v]) => v !== null));
      const saved = await api<Policy>('/settings', { method: 'PUT', body: JSON.stringify({ ...form, quotas }) });
      setForm(saved);
      setNotice({ tone: 'success', text: 'Policy saved. It applies to new requests right away.' });
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => (v === '' ? 0 : Number(v));
  return (
    <>
      <PageHeader eyebrow="System admin" title="Leave policy" />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card space-y-6 p-5 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="th">Second approval after</label>
              <div className="flex items-center gap-2"><input id="th" type="number" min={1} max={30} className="field data w-24" value={form.longLeaveThresholdDays} onChange={(e) => setForm({ ...form, longLeaveThresholdDays: num(e.target.value) })} /><span className="text-small text-muted">consecutive days</span></div>
              <p className="mt-1 text-tiny text-muted">Longer leave needs a document and HOD approval.</p>
            </div>
            <div>
              <label className="label" htmlFor="cn">Take back approved leave until</label>
              <div className="flex items-center gap-2"><input id="cn" type="number" min={0} max={60} className="field data w-24" value={form.cancelNoticeDays} onChange={(e) => setForm({ ...form, cancelNoticeDays: num(e.target.value) })} /><span className="text-small text-muted">days before it starts</span></div>
              <p className="mt-1 text-tiny text-muted">0 = until the day before the leave.</p>
            </div>
          </div>
          <div>
            <p className="label">Yearly quota (working days)</p>
            <ul className="divide-y divide-line rounded-control border border-line">
              {types.data.types.map((t) => (
                <li key={t.code} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-small font-medium">{t.label}</span>
                  {form.quotas[t.code] === null ? <span className="text-tiny text-muted">No cap</span> : (
                    <input type="number" min={0} max={365} aria-label={`${t.label} quota`} className="field data w-24 py-1.5" value={form.quotas[t.code] ?? 0} onChange={(e) => setForm({ ...form, quotas: { ...form.quotas, [t.code]: num(e.target.value) } })} />
                  )}
                </li>
              ))}
            </ul>
          </div>
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save policy'}</button>
        </section>
        <aside className="card h-fit space-y-2 p-5 text-small text-muted sm:p-6">
          <p className="eyebrow">How changes apply</p>
          <p>New requests use the new rules immediately. Requests already in progress keep the approval route they started with.</p>
          <p>Balances are recalculated from requests, so quota changes show up for everyone at once.</p>
          <p>Every change is written to the audit log with the before and after values.</p>
        </aside>
      </div>
    </>
  );
}
