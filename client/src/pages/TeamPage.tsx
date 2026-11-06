import { useState } from 'react';
import { ApiError, useApi, useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtTime } from '../lib/format';
import type { Person, TeamRequest } from '../lib/types';
import { Alert, Avatar, EmptyState, ErrorState, PageHeader, SkeletonList } from '../components/ui';
import { ROLE_LABEL } from '../components/Shell';

/** Manager: join requests inbox + team list. Admin: everyone in the organisation. */
export function TeamPage() {
  const api = useApi();
  const { me } = useMe();
  const isManager = me.role === 'MANAGER';
  const requests = useQuery<TeamRequest[]>(isManager ? '/team/requests' : null);
  const members = useQuery<Person[]>('/team/members');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function decide(r: TeamRequest, decision: 'ACCEPT' | 'REJECT') {
    setBusy(r._id + decision);
    setNotice(null);
    try {
      await api(`/team/requests/${r._id}/decision`, { method: 'POST', body: JSON.stringify({ decision, comment: comments[r._id] ?? '' }) });
      setNotice({ tone: 'success', text: decision === 'ACCEPT' ? `${r.employeeName} is now in your team.` : `Declined ${r.employeeName}'s request.` });
      requests.reload();
      members.reload();
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as ApiError).message });
      requests.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow={isManager ? 'Manager' : 'Admin'} title={isManager ? 'My team' : 'People'} />
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}

      {isManager && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h3>Join requests</h3>
            {!!requests.data?.length && <span className="rounded-full bg-accent px-2 py-0.5 text-tiny font-bold text-white">{requests.data.length}</span>}
          </div>
          {requests.loading && !requests.data ? <SkeletonList rows={1} /> : requests.error ? <ErrorState message={requests.error.message} onRetry={requests.reload} /> : requests.data!.length === 0 ? (
            <p className="card px-5 py-4 text-small text-muted">No one is waiting to join. New sign-ups who pick you will show up here.</p>
          ) : (
            <ul className="space-y-3">
              {requests.data!.map((r) => (
                <li key={r._id} className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <Avatar seed={r.employeeEmail} size={44} />
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">{r.employeeName} <span className="font-normal text-muted">wants to join your team</span></p>
                    <p className="text-tiny text-muted">{r.employeeEmail} · {fmtTime(r.createdAt)}</p>
                    {r.message && <p className="mt-1.5 text-small">“{r.message}”</p>}
                  </div>
                  <input className="field max-w-56 py-2 text-small" placeholder="Comment (optional)" value={comments[r._id] ?? ''} onChange={(e) => setComments({ ...comments, [r._id]: e.target.value })} />
                  <div className="flex gap-2">
                    <button className="btn-success" disabled={!!busy} onClick={() => decide(r, 'ACCEPT')}>{busy === r._id + 'ACCEPT' ? 'Adding…' : 'Accept'}</button>
                    <button className="btn-danger" disabled={!!busy} onClick={() => decide(r, 'REJECT')}>Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h3 className="mb-3">{isManager ? 'Team members' : 'Everyone'}</h3>
      {members.loading && !members.data ? <SkeletonList /> : members.error ? <ErrorState message={members.error.message} onRetry={members.reload} /> : members.data!.length === 0 ? (
        <EmptyState title="No team members yet" body="Accept a join request and they'll appear here." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.data!.map((p) => (
            <li key={p.id} className="card flex items-center gap-3 p-4">
              <Avatar seed={p.avatarSeed ?? p.email} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-tiny text-muted">{ROLE_LABEL[p.role]} · {p.email}</p>
              </div>
              <span className="data text-tiny text-muted">{p.employeeCode}</span>
              {!isManager && p.role === 'EMPLOYEE' && !p.managerId && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-tiny font-semibold text-warning">No team</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
