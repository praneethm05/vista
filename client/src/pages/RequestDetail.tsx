import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, useApi, useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtRange, plural } from '../lib/format';
import type { Detail, DocMeta } from '../lib/types';
import { Alert, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { ApprovalSteps, Timeline } from '../components/Timeline';
import { DocumentList, DocumentUpload } from '../components/Documents';

export function RequestDetail() {
  const { id } = useParams();
  const api = useApi();
  const location = useLocation();
  const { me, reload: reloadMe } = useMe();
  const { data, error, loading, reload } = useQuery<Detail>(`/leaves/${id}`);
  const policy = useQuery<{ cancelNoticeDays: number }>('/leave-types');
  const [reply, setReply] = useState('');
  const [replyDocs, setReplyDocs] = useState<DocMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  const { request: r, timeline, documents } = data!;
  const mine = r.employeeId === me.id;
  const open = ['PENDING_MANAGER', 'PENDING_HOD', 'INFO_REQUESTED'].includes(r.status);
  const typeLabel = me.balances.find((b) => b.code === r.leaveType)?.label ?? r.leaveType;
  const notice = policy.data?.cancelNoticeDays ?? 2;
  const daysUntilStart = Math.round((Date.parse(r.fromDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
  const canTakeBack = mine && r.status === 'APPROVED' && daysUntilStart >= notice;
  const infoAsk = [...timeline].reverse().find((t) => t.action === 'INFO_REQUESTED');

  async function run(path: string, body?: object) {
    setBusy(true);
    setActionError('');
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      setReply('');
      setReplyDocs([]);
      reload();
      reloadMe();
    } catch (e) {
      setActionError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to={mine ? '/' : '/approvals'} className="mb-4 inline-block text-small font-semibold text-brand">← Back</Link>
      {(location.state as { justCreated?: boolean } | null)?.justCreated && (
        <div className="mb-4"><Alert tone="success">Request sent. We’ll show every update right here.</Alert></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{typeLabel}</p>
              <h2 className="mt-1 uppercase">{fmtRange(r.fromDate, r.toDate)}</h2>
              <p className="data mt-1 text-small text-muted">{plural(r.workingDays, 'working day')} · {plural(r.calendarDays, 'calendar day')}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <ApprovalSteps requiresHod={r.requiresHod} status={r.status} />
          <div>
            <p className="label">Reason</p>
            <p className="text-body">{r.reason}</p>
          </div>
          <div>
            <p className="label">Documents</p>
            <DocumentList docs={documents} />
          </div>

          {mine && r.status === 'INFO_REQUESTED' && (
            <div className="space-y-3 rounded-card border border-info/25 bg-info-tint/60 p-4">
              <p className="text-small font-semibold text-info">{infoAsk?.actorName ?? 'Your approver'} asked: “{infoAsk?.comment}”</p>
              <textarea className="field" rows={3} placeholder="Your reply" value={reply} onChange={(e) => setReply(e.target.value)} />
              <DocumentUpload value={replyDocs} onChange={setReplyDocs} />
              <button className="btn-primary" disabled={busy || reply.trim().length < 3}
                onClick={() => run(`/leaves/${r._id}/respond`, { comment: reply, documentIds: replyDocs.map((d) => d._id) })}>
                {busy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          )}

          {actionError && <Alert>{actionError}</Alert>}
          {mine && r.status === 'APPROVED' && daysUntilStart >= 0 && (
            canTakeBack ? (
              <div className="flex flex-wrap items-center gap-3 rounded-card border border-line p-4">
                <p className="flex-1 text-small text-muted">Plans changed? You can take this leave back until {notice} day{notice === 1 ? '' : 's'} before it starts. Your balance is restored and your manager is told.</p>
                <button className="btn-ghost" disabled={busy} onClick={() => confirm('Take back this approved leave? Your days return to your balance.') && run(`/leaves/${r._id}/cancel`)}>Take back leave</button>
              </div>
            ) : (
              <p className="text-tiny text-muted">This leave starts in less than {notice} day{notice === 1 ? '' : 's'}, so it can no longer be taken back here. Please talk to your manager.</p>
            )
          )}
          {mine && open && (
            <button className="btn-danger" disabled={busy} onClick={() => confirm('Cancel this leave request?') && run(`/leaves/${r._id}/cancel`)}>
              Cancel request
            </button>
          )}
        </section>

        <aside className="card h-fit p-5 sm:p-6">
          <p className="eyebrow mb-4">Activity</p>
          <Timeline entries={timeline} />
        </aside>
      </div>
    </>
  );
}
