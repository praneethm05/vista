import { ACTION_LABEL, fmtTime } from '../lib/format';
import type { AuditEntry } from '../lib/types';

const DOT: Record<string, string> = {
  SUBMITTED: 'bg-brand', APPROVED_BY_MANAGER: 'bg-success', APPROVED: 'bg-success', REJECTED: 'bg-danger',
  INFO_REQUESTED: 'bg-info', INFO_PROVIDED: 'bg-brand', CANCELLED: 'bg-muted',
};

/** Audit trail rendered as a vertical timeline: who did what, when, and what they said. */
export function Timeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="relative ml-2 space-y-5 border-l border-line pl-6">
      {entries.map((e) => (
        <li key={e._id} className="relative">
          <span className={`absolute -left-[31px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${DOT[e.action] ?? 'bg-muted'}`} />
          <p className="text-small font-semibold">{ACTION_LABEL[e.action] ?? e.action}</p>
          <p className="text-tiny text-muted">
            {e.actorName} · {e.actorRole.toLowerCase()} · <span className="data">{fmtTime(e.at)}</span>
          </p>
          {e.comment && <p className="mt-1.5 rounded-control bg-canvas px-3 py-2 text-small">“{e.comment}”</p>}
        </li>
      ))}
    </ol>
  );
}

/** The approval chain as a compact stepper: Applied → Manager → (HOD) → Done. */
export function ApprovalSteps({ requiresHod, status }: { requiresHod: boolean; status: string }) {
  const steps = ['Applied', 'Manager', ...(requiresHod ? ['HOD'] : []), 'Decision'];
  const reached =
    status === 'APPROVED' || status === 'REJECTED' ? steps.length - 1
    : status === 'PENDING_HOD' ? 2
    : 1;
  const ended = status === 'REJECTED' ? 'bg-danger' : status === 'CANCELLED' ? 'bg-muted' : 'bg-success';
  return (
    <div className="flex items-center gap-2" aria-label="Approval progress">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div className="flex flex-col items-start gap-1">
            <span className={`h-1.5 w-full min-w-10 rounded-full ${i < reached ? ended : i === reached ? 'bg-accent' : 'bg-line'}`} />
            <span className={`text-tiny ${i <= reached ? 'font-semibold text-ink' : 'text-muted'}`}>{s}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
