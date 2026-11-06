import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, useApi, useQuery } from '../lib/api';
import { useMe } from '../lib/me';
import { countDays, plural, todayIso } from '../lib/format';
import type { DocMeta, LeaveRequest, LeaveType } from '../lib/types';
import { Alert, ErrorState, PageHeader, Spinner } from '../components/ui';
import { DocumentUpload } from '../components/Documents';

export function ApplyLeave() {
  const api = useApi();
  const navigate = useNavigate();
  const { me, reload: reloadMe } = useMe();
  const types = useQuery<{ types: LeaveType[]; longLeaveThresholdDays: number }>('/leave-types');

  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const type = types.data?.types.find((t) => t.code === leaveType);
  const threshold = types.data?.longLeaveThresholdDays ?? 3;
  const days = useMemo(() => countDays(fromDate, toDate), [fromDate, toDate]);
  const isLong = days.calendar > threshold;
  const needsDoc = !!type && (type.documentAlways || isLong);
  const balance = me.balances.find((b) => b.code === leaveType);
  const after = balance?.available != null ? balance.available - days.working : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      const created = await api<LeaveRequest>('/leaves', {
        method: 'POST',
        body: JSON.stringify({ leaveType, fromDate, toDate, reason, documentIds: docs.map((d) => d._id) }),
      });
      reloadMe();
      navigate(`/leaves/${created._id}`, { state: { justCreated: true } });
    } catch (err) {
      const apiErr = err as ApiError;
      setFieldErrors(apiErr.fields ?? {});
      setFormError(apiErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (types.loading && !types.data) return <Spinner />;
  if (types.error) return <ErrorState message={types.error.message} onRetry={types.reload} />;

  return (
    <>
      <PageHeader eyebrow="New request" title="Apply for leave" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} className="card space-y-6 p-5 sm:p-7" noValidate>
          <fieldset>
            <legend className="label">Leave type</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {types.data!.types.map((t) => {
                const b = me.balances.find((x) => x.code === t.code);
                const active = t.code === leaveType;
                return (
                  <button type="button" key={t.code} onClick={() => setLeaveType(t.code)} aria-pressed={active}
                    className={`rounded-control border p-3 text-left transition ${active ? 'border-brand bg-brand-tint ring-2 ring-brand/15' : 'border-line hover:border-brand/40'}`}>
                    <p className="text-small font-semibold">{t.label}</p>
                    <p className="text-tiny text-muted">{b?.available == null ? 'No cap' : `${b.available} left`}</p>
                  </button>
                );
              })}
            </div>
            {type && <p className="mt-2 text-small text-muted">{type.description}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" type="date" className="field data" value={fromDate} min={type?.backdateDays ? undefined : todayIso()}
                onChange={(e) => { setFromDate(e.target.value); if (!toDate || e.target.value > toDate) setToDate(e.target.value); }} required />
              {fieldErrors.fromDate && <p className="mt-1 text-small text-danger">{fieldErrors.fromDate}</p>}
            </div>
            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" type="date" className="field data" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} required />
              {fieldErrors.toDate && <p className="mt-1 text-small text-danger">{fieldErrors.toDate}</p>}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="reason">Reason</label>
            <textarea id="reason" rows={3} className="field" maxLength={500} placeholder="e.g. Sister's wedding in Mysuru" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-1 flex justify-between text-tiny text-muted">
              <span className="text-danger">{fieldErrors.reason}</span>
              <span>{reason.length}/500</span>
            </div>
          </div>

          {/* Progressive disclosure: documents only appear when the rules need them */}
          {needsDoc && (
            <div className="space-y-3 rounded-card border border-accent/30 bg-accent-tint/50 p-4">
              <p className="text-small font-semibold text-ink">
                {type?.documentAlways ? `${type.label} needs a supporting document.` : `More than ${threshold} consecutive days needs a supporting document.`}
              </p>
              <DocumentUpload value={docs} onChange={setDocs} />
              {fieldErrors.documentIds && <p className="text-small text-danger">Please attach at least one document.</p>}
            </div>
          )}

          {formError && <Alert>{formError}</Alert>}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button>
            <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          </div>
        </form>

        <aside className="card h-fit space-y-4 p-5 sm:p-6 lg:sticky lg:top-24">
          <p className="eyebrow">Summary</p>
          {days.calendar === 0 ? (
            <p className="text-small text-muted">Pick your dates to see how many days this uses and who needs to approve it.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[3rem] leading-none">{days.working}</span>
                <span className="text-small text-muted">{days.working === 1 ? 'working day' : 'working days'} · {plural(days.calendar, 'calendar day')}</span>
              </div>
              {after !== null && (
                <p className={`text-small ${after < 0 ? 'font-semibold text-danger' : 'text-muted'}`}>
                  {after < 0 ? `That's ${-after} more than you have left.` : `${balance!.label}: ${balance!.available} → ${after} days left after this.`}
                </p>
              )}
              <div>
                <p className="label">Approval route</p>
                <ol className="flex flex-wrap items-center gap-2 text-small">
                  <li className="rounded-full bg-warning-tint px-3 py-1 font-semibold text-warning">Manager</li>
                  {isLong && <><li aria-hidden>→</li><li className="rounded-full bg-brand-tint px-3 py-1 font-semibold text-brand">HOD</li></>}
                </ol>
                {isLong && <p className="mt-2 text-tiny text-muted">Longer than {threshold} days, so your HOD approves too.</p>}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
