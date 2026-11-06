import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtRange, plural } from '../lib/format';
import type { LeaveRequest } from '../lib/types';
import { Avatar, EmptyState, ErrorState, PageHeader, SkeletonList, StatusBadge } from '../components/ui';

export function Approvals() {
  const { me } = useMe();
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const { data, error, loading, reload } = useQuery<LeaveRequest[]>(`/approvals?scope=${scope}`);
  const typeLabel = (code: string) => me.balances.find((b) => b.code === code)?.label ?? code;

  return (
    <>
      <PageHeader
        eyebrow={me.role === 'ADMIN' ? 'Admin · HOD approvals' : 'Manager'}
        title="Approvals"
        action={
          <div className="flex rounded-full border border-line bg-surface p-1 text-small font-semibold" role="tablist">
            {(['pending', 'all'] as const).map((s) => (
              <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
                className={`rounded-full px-4 py-1.5 ${scope === s ? 'bg-brand text-white' : 'text-muted'}`}>
                {s === 'pending' ? 'Needs your decision' : 'All requests'}
              </button>
            ))}
          </div>
        }
      />
      {loading && !data ? <SkeletonList rows={4} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data!.length === 0 ? (
        <EmptyState title={scope === 'pending' ? "You're all caught up" : 'No requests yet'} body={scope === 'pending' ? 'New leave requests from your team will appear here.' : 'Requests from your team will show up here.'} />
      ) : (
        <ul className="space-y-3">
          {data!.map((r) => {
            const clashes = r.insights?.teamClashes.length ?? 0;
            return (
              <li key={r._id}>
                <Link to={`/approvals/${r._id}`} className="card grid items-center gap-4 p-4 transition hover:border-brand/40 sm:grid-cols-[2fr_1.6fr_1fr_auto] sm:p-5">
                  <div className="flex items-center gap-3">
                    <Avatar seed={r.employeeEmail || r.employeeId} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.employeeName}</p>
                      <p className="text-small text-muted">{typeLabel(r.leaveType)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="data text-small font-medium">{fmtRange(r.fromDate, r.toDate)}</p>
                    <p className="text-tiny text-muted">{plural(r.workingDays, 'working day')}{r.requiresHod ? ' · needs HOD' : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.documentIds.length > 0 && <span className="rounded-full bg-accent-tint px-2 py-0.5 text-tiny font-semibold text-accent">📎 {r.documentIds.length}</span>}
                    {clashes > 0 && <span className="rounded-full bg-warning-tint px-2 py-0.5 text-tiny font-semibold text-warning">⚠ {clashes} teammate{clashes > 1 ? 's' : ''} off</span>}
                  </div>
                  <StatusBadge status={r.status} short />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
