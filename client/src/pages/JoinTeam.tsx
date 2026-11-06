import { useState } from 'react';
import { ApiError, useApi, useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtTime } from '../lib/format';
import type { ManagerOption, TeamRequest } from '../lib/types';
import { Alert, Avatar, PageHeader, Spinner } from '../components/ui';

/** First stop for a new sign-up: find your manager and ask to join their team. */
export function JoinTeam() {
  const api = useApi();
  const { me, reload: reloadMe } = useMe();
  const existing = useQuery<TeamRequest | null>('/team/join-request');
  const [query, setQuery] = useState('');
  const managers = useQuery<ManagerOption[]>(`/team/managers?q=${encodeURIComponent(query)}`);
  const [picked, setPicked] = useState<ManagerOption | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      await api('/team/join-request', { method: 'POST', body: JSON.stringify({ managerId: picked.id, message }) });
      setPicked(null);
      setMessage('');
      existing.reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const pending = existing.data?.status === 'PENDING' ? existing.data : null;
  const rejected = existing.data?.status === 'REJECTED' ? existing.data : null;

  return (
    <>
      <PageHeader eyebrow={`Welcome, ${me.name.split(' ')[0]}`} title="Join your team" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card space-y-5 p-5 sm:p-7">
          {existing.loading && !existing.data ? <Spinner /> : pending ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-card bg-warning-tint p-4">
                <span className="size-2.5 animate-pulse rounded-full bg-warning" />
                <p className="text-small font-semibold text-warning">Request sent · waiting for your manager to accept</p>
              </div>
              <p className="text-small text-muted">Sent {fmtTime(pending.createdAt)}. You can apply for leave as soon as you're in the team.</p>
              <button className="btn-ghost" onClick={() => { reloadMe(); existing.reload(); }}>Check again</button>
              <p className="text-tiny text-muted">Asked the wrong person? Pick another manager below; it replaces this request.</p>
            </div>
          ) : rejected ? (
            <Alert tone="warning">Your last request was declined{rejected.decisionComment ? `: “${rejected.decisionComment}”` : ''}. You can ask another manager.</Alert>
          ) : (
            <p className="text-body text-muted">Before you can apply for leave, your manager needs to add you to their team. Find them by name or employee ID.</p>
          )}

          <div>
            <label className="label" htmlFor="mgr">Manager name or ID</label>
            <input id="mgr" className="field" placeholder="e.g. Meera or VST-0002" value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null); }} autoComplete="off" />
          </div>
          <ul className="max-h-72 space-y-2 overflow-auto" aria-label="Managers">
            {managers.data?.length === 0 && <li className="text-small text-muted">No manager matches “{query}”.</li>}
            {managers.data?.map((m) => {
              const active = picked?.id === m.id;
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setPicked(m)} aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-control border p-3 text-left transition ${active ? 'border-brand bg-brand-tint ring-2 ring-brand/15' : 'border-line hover:border-brand/40'}`}>
                    <Avatar seed={m.email} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.name}</span>
                      <span className="block truncate text-tiny text-muted">{m.department} · {m.email}</span>
                    </span>
                    <span className="data text-tiny text-muted">{m.employeeCode}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {picked && (
            <div className="space-y-3 rounded-card border border-brand/20 bg-brand-tint/40 p-4">
              <label className="label" htmlFor="note">Note for {picked.name.split(' ')[0]} <span className="font-normal text-muted">(optional)</span></label>
              <textarea id="note" rows={2} maxLength={300} className="field" placeholder="e.g. I joined the Payments squad this week." value={message} onChange={(e) => setMessage(e.target.value)} />
              {error && <Alert>{error}</Alert>}
              <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : `Ask ${picked.name.split(' ')[0]} to add me`}</button>
            </div>
          )}
        </section>

        <aside className="card h-fit space-y-3 p-5 sm:p-6">
          <p className="eyebrow">How it works</p>
          <ol className="space-y-3 text-small">
            {['Find your manager and send a request.', 'Your manager accepts you into their team.', 'Apply for leave. Longer leave also goes to the admin (HOD).'].map((t, i) => (
              <li key={t} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-tiny font-bold text-white">{i + 1}</span>{t}</li>
            ))}
          </ol>
          <p className="border-t border-line pt-3 text-tiny text-muted">Your employee ID: <span className="data font-semibold text-ink">{me.employeeCode}</span></p>
        </aside>
      </div>
    </>
  );
}
