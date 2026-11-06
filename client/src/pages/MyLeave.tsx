import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtRange, plural } from '../lib/format';
import type { LeaveRequest } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, SkeletonList, StatusBadge } from '../components/ui';

export function MyLeave() {
  const { me } = useMe();
  const { data, error, loading, reload } = useQuery<LeaveRequest[]>('/leaves/mine');
  const typeLabel = (code: string) => me.balances.find((b) => b.code === code)?.label ?? code;
  // Progressive disclosure: show the 3 main balances; the rest are one tap away on the apply form.
  const main = me.balances.filter((b) => ['ANNUAL', 'SICK', 'CASUAL'].includes(b.code));
  const open = data?.filter((r) => ['PENDING_MANAGER', 'PENDING_HOD', 'INFO_REQUESTED'].includes(r.status)) ?? [];

  return (
    <>
      <PageHeader eyebrow={`Hi ${me.name.split(' ')[0]}`} title="My leave" action={<Link to="/apply" className="btn-accent">+ Apply for leave</Link>} />

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        {main.map((b) => {
          const pct = b.quota ? Math.min(100, ((b.used + b.pending) / b.quota) * 100) : 0;
          return (
            <div key={b.code} className="card p-5">
              <p className="eyebrow">{b.label}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-display text-[2.75rem] leading-none">{b.available}</span>
                <span className="text-small text-muted">of {b.quota} days left</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-tint">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-tiny text-muted">{b.used} used{b.pending ? ` · ${b.pending} pending` : ''}</p>
            </div>
          );
        })}
      </section>

      {open.some((r) => r.status === 'INFO_REQUESTED') && (
        <div className="mb-6 rounded-card border border-info/25 bg-info-tint p-4 text-small text-info">
          <strong>Action needed:</strong> an approver has asked for more information on one of your requests.
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h3>History</h3>
        {data && <span className="text-small text-muted">{plural(data.length, 'request')}</span>}
      </div>
      {loading && !data ? <SkeletonList /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data!.length === 0 ? (
        <EmptyState title="No leave yet" body="When you apply, your requests and their status will show up here." action={<Link to="/apply" className="btn-primary">Apply for leave</Link>} />
      ) : (
        <ul className="space-y-3">
          {data!.map((r) => (
            <li key={r._id}>
              <Link to={`/leaves/${r._id}`} className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 transition hover:border-brand/40 sm:p-5">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{typeLabel(r.leaveType)}</p>
                  <p className="data text-small text-muted">{fmtRange(r.fromDate, r.toDate)} · {plural(r.workingDays, 'working day')}</p>
                </div>
                <p className="hidden flex-[2] truncate text-small text-muted md:block">{r.lastComment ? `“${r.lastComment}”` : r.reason}</p>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
