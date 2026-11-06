import type { Status } from './types';

export const STATUS_META: Record<Status, { label: string; short: string; className: string; dot: string }> = {
  PENDING_MANAGER: { label: 'Waiting for manager', short: 'With manager', className: 'bg-warning-tint text-warning', dot: 'bg-warning' },
  PENDING_HOD: { label: 'Waiting for HOD', short: 'With HOD', className: 'bg-brand-tint text-brand', dot: 'bg-brand' },
  INFO_REQUESTED: { label: 'More info needed', short: 'Info needed', className: 'bg-info-tint text-info', dot: 'bg-info' },
  APPROVED: { label: 'Approved', short: 'Approved', className: 'bg-success-tint text-success', dot: 'bg-success' },
  REJECTED: { label: 'Rejected', short: 'Rejected', className: 'bg-danger-tint text-danger', dot: 'bg-danger' },
  CANCELLED: { label: 'Cancelled', short: 'Cancelled', className: 'bg-line/60 text-muted', dot: 'bg-muted' },
};

export const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: 'Applied for leave',
  APPROVED_BY_MANAGER: 'Manager approved · sent to HOD',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  INFO_REQUESTED: 'Asked for more information',
  INFO_PROVIDED: 'Provided more information',
  CANCELLED: 'Cancelled the request',
  DOCUMENT_UPLOADED: 'Uploaded a document',
};

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYearFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtRange = (from: string, to: string) =>
  from.slice(0, 10) === to.slice(0, 10) ? dayYearFmt.format(new Date(from)) : `${fmtDay(from)} – ${dayYearFmt.format(new Date(to))}`;
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const DAY = 86_400_000;
export function countDays(from: string, to: string) {
  if (!from || !to || to < from) return { calendar: 0, working: 0 };
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  let working = 0;
  for (let t = a; t <= b; t += DAY) { const d = new Date(t).getUTCDay(); if (d && d !== 6) working++; }
  return { calendar: Math.round((b - a) / DAY) + 1, working };
}
export const todayIso = () => new Date().toISOString().slice(0, 10);
