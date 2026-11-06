import { Link } from 'react-router-dom';
import { useQuery } from '../lib/api';
import { ACTION_LABEL, STATUS_META, fmtTime } from '../lib/format';
import type { AuditEntry } from '../lib/types';
import { EmptyState, ErrorState, PageHeader, RoleTag, SkeletonList } from '../components/ui';

export function AuditPage() {
  const { data, error, loading, reload } = useQuery<AuditEntry[]>('/audit');
  return (
    <>
      <PageHeader eyebrow="Compliance" title="Audit log" action={<button className="btn-ghost" onClick={reload}>Refresh</button>} />
      {loading && !data ? <SkeletonList rows={5} /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data!.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Every submission, approval, rejection and upload will be recorded here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-small">
            <thead className="border-b border-line bg-canvas text-tiny uppercase tracking-wider text-muted">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">What</th><th className="px-4 py-3">Status change</th><th className="px-4 py-3">Comment</th></tr>
            </thead>
            <tbody>
              {data!.map((e) => (
                <tr key={e._id} className="border-b border-line last:border-0">
                  <td className="data whitespace-nowrap px-4 py-3 text-muted">{fmtTime(e.at)}</td>
                  <td className="px-4 py-3"><span className="font-medium">{e.actorName}</span> <RoleTag role={e.actorRole} /></td>
                  <td className="px-4 py-3">{e.requestId ? <Link className="font-medium text-brand" to={`/approvals/${e.requestId}`}>{ACTION_LABEL[e.action] ?? e.action}</Link> : ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-tiny">{e.fromStatus ? STATUS_META[e.fromStatus].short : '-'} → {e.toStatus ? STATUS_META[e.toStatus].short : '-'}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted">{e.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
