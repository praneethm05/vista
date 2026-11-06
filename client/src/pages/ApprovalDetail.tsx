import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, useApi, useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { fmtRange, plural } from '../lib/format';
import type { Detail } from '../lib/types';
import { Alert, Avatar, ErrorState, Spinner, StatusBadge } from '../components/ui';
import { ApprovalSteps, Timeline } from '../components/Timeline';
import { DocumentList } from '../components/Documents';

type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

export function ApprovalDetail() {
  const { id } = useParams();
  const api = useApi();
  const { me } = useMe();
  const { data, error, loading, reload } = useQuery<Detail>(`/approvals/${id}`);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  const { request: r, timeline, documents } = data!;
  const insights = r.insights;
  const myTurn = (r.status === 'PENDING_MANAGER' && r.managerId === me.id) || (r.status === 'PENDING_HOD' && r.hodId === me.id);
  const typeLabel = me.balances.find((b) => b.code === r.leaveType)?.label ?? r.leaveType;

  async function decide(action: Decision) {
    setBusy(action);
    setResult(null);
    try {
      await api(`/approvals/${r._id}/actions`, { method: 'POST', body: JSON.stringify({ action, comment }) });
      const text = { APPROVE: r.status === 'PENDING_MANAGER' && r.requiresHod ? 'Approved and sent to the HOD.' : 'Leave approved.', REJECT: 'Leave rejected.', REQUEST_INFO: 'Question sent to the employee.' }[action];
      setResult({ tone: 'success', text });
      setComment('');
      reload();
    } catch (e) {
      setResult({ tone: 'danger', text: (e as ApiError).message });
      if ((e as ApiError).code === 'STALE') reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Link to="/approvals" className="mb-4 inline-block text-small font-semibold text-brand">← All approvals</Link>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-6">
          <div className="card space-y-6 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <Avatar seed={r.employeeEmail || r.employeeId} size={52} />
                <div>
                  <p className="text-subtitle font-semibold">{r.employeeName}</p>
                  <p className="text-small text-muted">{r.department} · {typeLabel}</p>
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div>
              <h2 className="uppercase">{fmtRange(r.fromDate, r.toDate)}</h2>
              <p className="data mt-1 text-small text-muted">{plural(r.workingDays, 'working day')} · {plural(r.calendarDays, 'calendar day')}{r.requiresHod ? ' · Manager + HOD approval' : ''}</p>
            </div>
            <ApprovalSteps requiresHod={r.requiresHod} status={r.status} />
            <div><p className="label">Reason</p><p>{r.reason}</p></div>
            <div><p className="label">Documents</p><DocumentList docs={documents} /></div>
          </div>

          {/* Decision panel: only when it's this approver's turn */}
          {myTurn ? (
            <div className="card space-y-4 p-5 sm:p-7">
              <p className="eyebrow">Your decision</p>
              <div>
                <label className="label" htmlFor="comment">Comment <span className="font-normal text-muted">(required to reject or ask for info)</span></label>
                <textarea id="comment" rows={3} className="field" maxLength={500} placeholder="e.g. Approved, please hand over the release checklist to Ravi." value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              {result && <Alert tone={result.tone}>{result.text}</Alert>}
              <div className="flex flex-wrap gap-3">
                <button className="btn-success" disabled={!!busy} onClick={() => decide('APPROVE')}>{busy === 'APPROVE' ? 'Approving…' : r.status === 'PENDING_MANAGER' && r.requiresHod ? 'Approve & send to HOD' : 'Approve'}</button>
                <button className="btn-ghost" disabled={!!busy || !comment.trim()} onClick={() => decide('REQUEST_INFO')}>{busy === 'REQUEST_INFO' ? 'Sending…' : 'Ask for more info'}</button>
                <button className="btn-danger" disabled={!!busy || !comment.trim()} onClick={() => decide('REJECT')}>{busy === 'REJECT' ? 'Rejecting…' : 'Reject'}</button>
              </div>
            </div>
          ) : (
            result ? <Alert tone={result.tone}>{result.text}</Alert> : (
              <Alert tone="info">{r.status === 'INFO_REQUESTED' ? 'Waiting for the employee to reply.' : r.status === 'PENDING_HOD' ? 'Waiting for the HOD.' : 'No action needed from you.'}</Alert>
            )
          )}
        </section>

        <aside className="space-y-6">
          {insights && (
            <div className="card space-y-4 p-5 sm:p-6">
              <p className="eyebrow">Before you decide</p>
              {insights.balance && insights.balance.quota !== null ? (
                <div>
                  <p className="text-small text-muted">{insights.balance.label} after approval</p>
                  <p className="flex items-baseline gap-2">
                    <span className={`font-display text-[2.5rem] leading-none ${(insights.balanceAfterApproval ?? 0) < 0 ? 'text-danger' : ''}`}>{insights.balanceAfterApproval}</span>
                    <span className="text-small text-muted">of {insights.balance.quota} days</span>
                  </p>
                </div>
              ) : <p className="text-small text-muted">This leave type has no yearly cap.</p>}
              <div>
                <p className="label">Team on leave these days</p>
                {insights.teamClashes.length === 0 ? <p className="text-small text-success">Nobody else from the team is off.</p> : (
                  <ul className="space-y-2">
                    {insights.teamClashes.map((c) => (
                      <li key={c._id} className="flex items-center justify-between gap-2 rounded-control bg-warning-tint px-3 py-2 text-small">
                        <span className="font-medium">{c.employeeName}</span>
                        <span className="data text-tiny text-warning">{fmtRange(c.fromDate, c.toDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <div className="card p-5 sm:p-6">
            <p className="eyebrow mb-4">Activity</p>
            <Timeline entries={timeline} />
          </div>
        </aside>
      </div>
    </>
  );
}
