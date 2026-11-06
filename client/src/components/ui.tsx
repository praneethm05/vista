import type { ReactNode } from 'react';
import { STATUS_META } from '../lib/format';
import type { Status } from '../lib/types';

const AVATAR_BG = ['eee7fa', 'ffefe5', 'e6f4ed', 'e7f1fa', 'fff4e0'];

/** DiceBear "notionists" avatar (same approach as Nora), background picked from the seed. */
export function Avatar({ seed, size = 36, className = '' }: { seed: string; size?: number; className?: string }) {
  const bg = AVATAR_BG[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_BG.length];
  const src = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
  return <img src={src} alt="" width={size} height={size} className={`shrink-0 rounded-full border border-line ${className}`} />;
}

export function StatusBadge({ status, short = false }: { status: Status; short?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-tiny font-semibold ${meta.className}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-small text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
      {label}
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-card bg-line/50" />)}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-2 grid size-12 place-items-center rounded-full bg-brand-tint text-brand">✦</div>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-small text-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 border-danger/30 bg-danger-tint/40 p-5" role="alert">
      <p className="font-semibold text-danger">We couldn’t load this</p>
      <p className="text-small text-ink">{message}</p>
      {onRetry && <button className="btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'info' | 'warning' | 'success'; children: ReactNode }) {
  const tones = {
    danger: 'border-danger/25 bg-danger-tint text-danger',
    info: 'border-info/25 bg-info-tint text-info',
    warning: 'border-warning/25 bg-warning-tint text-warning',
    success: 'border-success/25 bg-success-tint text-success',
  };
  return <div className={`rounded-control border px-4 py-3 text-small font-medium ${tones[tone]}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-[2.25rem] uppercase sm:text-[2.75rem]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const ROLE_STYLE: Record<string, { label: string; className: string }> = {
  EMPLOYEE: { label: 'Employee', className: 'border-line text-muted' },
  MANAGER: { label: 'Manager', className: 'border-warning/40 text-warning' },
  ADMIN: { label: 'Admin · HOD', className: 'border-brand/40 text-brand' },
  SYSADMIN: { label: 'System admin', className: 'border-ink/30 text-ink' },
};

/** Small outlined role tag, so it is always clear who is who in a workflow. */
export function RoleTag({ role }: { role: string }) {
  const r = ROLE_STYLE[role] ?? { label: role, className: 'border-line text-muted' };
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px align-middle text-[0.6875rem] font-semibold leading-4 ${r.className}`}>{r.label}</span>;
}
