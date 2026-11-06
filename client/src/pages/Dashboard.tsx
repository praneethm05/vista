import { useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtRange, shortDay } from '../lib/format';
import type { Status } from '../lib/types';
import { Avatar, ErrorState, PageHeader, RoleTag, SkeletonList, StatusBadge } from '../components/ui';

interface Stats {
  scope: 'team' | 'organisation';
  headcount: number;
  onLeaveToday: number;
  pending: number;
  approvedThisMonth: number;
  byType: { code: string; label: string; days: number; requests: number }[];
  byStatus: Partial<Record<Status, number>>;
  roster: { id: string; name: string; email: string; role: string; department: string; status: 'ON_LEAVE' | 'WORKING'; leaveType: string | null; backOn: string | null }[];
  approvers: { id: string; name: string; role: string; email: string; approved: number; rejected: number; askedInfo: number; approvalRate: number | null; avgResponseHours: number | null }[];
  upcoming: { _id: string; employeeName: string; leaveType: string; fromDate: string; toDate: string; status: Status }[];
}

const STATUS_ORDER: { key: Status; label: string; color: string }[] = [
  { key: 'APPROVED', label: 'Approved', color: 'bg-success' },
  { key: 'PENDING_MANAGER', label: 'With manager', color: 'bg-warning' },
  { key: 'PENDING_HOD', label: 'With HOD', color: 'bg-brand' },
  { key: 'INFO_REQUESTED', label: 'Info needed', color: 'bg-info' },
  { key: 'REJECTED', label: 'Rejected', color: 'bg-danger' },
  { key: 'CANCELLED', label: 'Cancelled', color: 'bg-muted' },
];

/** Who is out, what is pending, and where leave goes: for managers (their team) and admins (everyone). */
export function Dashboard() {
  const { me } = useMe();
  const { data, error, loading, reload } = useQuery<Stats>('/stats');
  if (loading && !data) return <SkeletonList rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  const s = data!;
  const maxDays = Math.max(1, ...s.byType.map((t) => t.days));
  const totalStatus = STATUS_ORDER.reduce((n, x) => n + (s.byStatus[x.key] ?? 0), 0);
  const typeLabel = (code: string | null) => s.byType.find((t) => t.code === code)?.label ?? code ?? '';
  const away = s.roster.filter((r) => r.status === 'ON_LEAVE');

  return (
    <>
      <PageHeader eyebrow={s.scope === 'team' ? `${me.name.split(' ')[0]}'s team` : 'Whole organisation'} title="Dashboard" />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: s.scope === 'team' ? 'People in team' : 'People', value: s.headcount, note: 'employees and managers' },
          { label: 'On leave today', value: s.onLeaveToday, note: s.headcount ? `${Math.round((s.onLeaveToday / s.headcount) * 100)}% of the ${s.scope}` : '' },
          { label: 'Waiting for a decision', value: s.pending, note: 'pending or info needed', accent: s.pending > 0 },
          { label: 'Approved this month', value: s.approvedThisMonth, note: 'requests' },
        ].map((k) => (
          <div key={k.label} className={`card p-5 ${k.accent ? 'border-accent/40' : ''}`}>
            <p className="eyebrow">{k.label}</p>
            <p className={`mt-2 font-display text-[2.75rem] leading-none ${k.accent ? 'text-accent' : ''}`}>{k.value}</p>
            <p className="mt-1 text-tiny text-muted">{k.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3>Leave taken this year</h3>
            <span className="text-tiny text-muted">approved working days by type</span>
          </div>
          <ul className="space-y-3">
            {s.byType.map((t) => (
              <li key={t.code} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-small">
                <span className="truncate text-muted">{t.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-brand-tint">
                  <span className="block h-full rounded-full bg-brand transition-all" style={{ width: `${(t.days / maxDays) * 100}%` }} />
                </span>
                <span className="data text-right font-semibold">{t.days}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-body">Requests by status</h3>
              <span className="text-tiny text-muted">{totalStatus} this year</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label="Requests by status">
              {STATUS_ORDER.map((x) => {
                const n = s.byStatus[x.key] ?? 0;
                return n ? <span key={x.key} className={x.color} style={{ width: `${(n / Math.max(1, totalStatus)) * 100}%` }} title={`${x.label}: ${n}`} /> : null;
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-tiny text-muted">
              {STATUS_ORDER.map((x) => (
                <li key={x.key} className="flex items-center gap-1.5"><span className={`size-2 rounded-sm ${x.color}`} />{x.label} <span className="data font-semibold text-ink">{s.byStatus[x.key] ?? 0}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-6">
          <div className="card p-5 sm:p-6">
            <h3 className="mb-3">Out today</h3>
            {away.length === 0 ? <p className="text-small text-success">Everyone is in today.</p> : (
              <ul className="space-y-2">
                {away.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar seed={p.email} size={32} />
                    <span className="min-w-0 flex-1 truncate text-small font-medium">{p.name}</span>
                    <span className="text-tiny text-muted">{typeLabel(p.leaveType)} · back {p.backOn && shortDay(p.backOn)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5 sm:p-6">
            <h3 className="mb-3">Next 7 days</h3>
            {s.upcoming.length === 0 ? <p className="text-small text-muted">No leave coming up this week.</p> : (
              <ul className="space-y-2">
                {s.upcoming.map((u) => (
                  <li key={u._id} className="flex flex-wrap items-center justify-between gap-2 text-small">
                    <span className="font-medium">{u.employeeName}</span>
                    <span className="data text-tiny text-muted">{fmtRange(u.fromDate, u.toDate)}</span>
                    <StatusBadge status={u.status} short />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {s.approvers.length > 0 && (
        <section className="card mt-6 overflow-x-auto p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3>Approver activity</h3>
            <span className="text-tiny text-muted">this year · response time = from request (or reply) to decision</span>
          </div>
          <table className="w-full min-w-[640px] text-left text-small">
            <thead className="text-tiny uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Approver</th>
                <th className="py-2 pr-3 text-right font-semibold">Approved</th>
                <th className="py-2 pr-3 text-right font-semibold">Rejected</th>
                <th className="py-2 pr-3 text-right font-semibold">Asked info</th>
                <th className="py-2 pr-3 font-semibold">Approval rate</th>
                <th className="py-2 text-right font-semibold">Avg response</th>
              </tr>
            </thead>
            <tbody>
              {s.approvers.map((a, i) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar seed={a.email || a.id} size={28} />
                      <span className="font-medium">{a.name}</span> <RoleTag role={a.role} />
                      {i === 0 && <span className="text-tiny font-semibold text-accent">Most active</span>}
                    </span>
                  </td>
                  <td className="data py-2.5 pr-3 text-right font-semibold text-success">{a.approved}</td>
                  <td className="data py-2.5 pr-3 text-right text-danger">{a.rejected}</td>
                  <td className="data py-2.5 pr-3 text-right text-info">{a.askedInfo}</td>
                  <td className="py-2.5 pr-3">
                    {a.approvalRate === null ? <span className="text-tiny text-muted">n/a</span> : (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-danger-tint"><span className="block h-full bg-success" style={{ width: `${a.approvalRate}%` }} /></span>
                        <span className="data text-tiny">{a.approvalRate}%</span>
                      </span>
                    )}
                  </td>
                  <td className="data py-2.5 text-right">{a.avgResponseHours === null ? 'n/a' : a.avgResponseHours < 1 ? `${Math.max(1, Math.round(a.avgResponseHours * 60))} min` : `${a.avgResponseHours} h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6">
        <h3 className="mb-3">{s.scope === 'team' ? 'Team status' : 'Everyone'}</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.roster.map((p) => (
            <li key={p.id} className="card flex items-center gap-3 p-4">
              <Avatar seed={p.email} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-tiny text-muted"><RoleTag role={p.role} /> {p.department}</p>
              </div>
              {p.status === 'ON_LEAVE' ? (
                <span className="rounded-md bg-accent-tint px-2 py-1 text-tiny font-semibold text-accent">On leave</span>
              ) : (
                <span className="rounded-md bg-success-tint px-2 py-1 text-tiny font-semibold text-success">Working</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
