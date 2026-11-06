import { User } from '../models/User.js';
import type { LeaveRequestDoc } from '../models/LeaveRequest.js';
import { getLeaveType, type LeaveTypeCode } from '../domain/leaveTypes.js';
import { appUrl, sendEmail } from './mailService.js';

/** Who gets told what, at each step of the workflow. */

const fmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const range = (r: LeaveRequestDoc) => {
  const a = fmt.format(new Date(r.fromDate));
  const b = fmt.format(new Date(r.toDate));
  return a === b ? a : `${a} – ${b}`;
};
const typeLabel = (r: LeaveRequestDoc) => getLeaveType(r.leaveType as LeaveTypeCode).label;
const days = (r: LeaveRequestDoc) => `${r.workingDays} working day${r.workingDays === 1 ? '' : 's'}`;
const rows = (r: LeaveRequestDoc): [string, string][] => [
  ['Employee', r.employeeName],
  ['Leave type', typeLabel(r)],
  ['Dates', range(r)],
  ['Duration', days(r)],
  ['Approval', r.requiresHod ? 'Manager, then Admin (HOD)' : 'Manager'],
];

async function emailOf(clerkId: string | null | undefined) {
  if (!clerkId) return null;
  const user = await User.findOne({ clerkId }).select('email name').lean();
  return user?.email ?? null;
}

export async function leaveSubmitted(r: LeaveRequestDoc) {
  await sendEmail(await emailOf(r.managerId), `${r.employeeName} requested ${days(r)} off`, {
    preheader: `${typeLabel(r)} · ${range(r)}: needs your decision`,
    eyebrow: 'Needs your decision',
    title: `${r.employeeName} requested ${typeLabel(r).toLowerCase()}`,
    intro: r.requiresHod ? 'This is longer than 3 days, so after you approve it goes to the Admin (HOD).' : 'Review the request and approve, reject or ask for more information.',
    status: { label: 'Waiting for you', tone: 'pending' },
    rows: rows(r),
    quote: { by: r.employeeName, text: r.reason },
    cta: { label: 'Review request', url: appUrl(`/approvals/${r._id}`) },
  });
}

export async function leaveDecided(r: LeaveRequestDoc, actorName: string, comment: string) {
  const link = appUrl(`/leaves/${r._id}`);
  const quote = comment ? { by: actorName, text: comment } : undefined;
  if (r.status === 'PENDING_HOD') {
    await sendEmail(r.employeeEmail, `Your leave is approved by your manager · now with the HOD`, {
      preheader: `${range(r)}: one more approval to go`,
      eyebrow: 'Leave update', title: 'Manager approved · one step left', intro: `${actorName} approved your leave. Because it is longer than 3 days, the Admin (HOD) gives the final approval.`,
      status: { label: 'With HOD', tone: 'hod' }, rows: rows(r), quote, cta: { label: 'Track request', url: link },
    });
    await sendEmail(await emailOf(r.hodId), `${r.employeeName}'s leave needs final approval`, {
      preheader: `${days(r)} · approved by manager`,
      eyebrow: 'Needs your decision', title: `Final approval: ${r.employeeName}`, intro: `${actorName} approved this request. It needs your final approval as HOD.`,
      status: { label: 'Waiting for you', tone: 'hod' }, rows: rows(r), quote: { by: r.employeeName, text: r.reason }, cta: { label: 'Review request', url: appUrl(`/approvals/${r._id}`) },
    });
    return;
  }
  const map = {
    APPROVED: { subject: `Approved: your leave on ${range(r)} 🎉`, title: 'Your leave is approved', tone: 'approved' as const, label: 'Approved', intro: `${actorName} approved your leave. Hasta la vista, enjoy your time off!` },
    REJECTED: { subject: `Your leave request was not approved`, title: 'Leave not approved', tone: 'rejected' as const, label: 'Rejected', intro: `${actorName} could not approve this request. Their note is below; you can apply again for other dates.` },
    INFO_REQUESTED: { subject: `More information needed for your leave`, title: 'Your approver has a question', tone: 'info' as const, label: 'Info needed', intro: `${actorName} needs a little more information before deciding. Reply from the request page.` },
  } as const;
  const m = map[r.status as keyof typeof map];
  if (!m) return;
  await sendEmail(r.employeeEmail, m.subject, {
    preheader: `${typeLabel(r)} · ${range(r)}`, eyebrow: 'Leave update', title: m.title, intro: m.intro,
    status: { label: m.label, tone: m.tone }, rows: rows(r), quote, cta: { label: r.status === 'INFO_REQUESTED' ? 'Reply now' : 'View request', url: link },
  });
}

export async function infoProvided(r: LeaveRequestDoc, reply: string) {
  const approverId = r.status === 'PENDING_HOD' ? r.hodId : r.managerId;
  await sendEmail(await emailOf(approverId), `${r.employeeName} replied to your question`, {
    preheader: reply.slice(0, 90), eyebrow: 'Needs your decision', title: `${r.employeeName} sent more information`, intro: 'The request is back in your queue.',
    status: { label: 'Waiting for you', tone: 'pending' }, rows: rows(r), quote: { by: r.employeeName, text: reply }, cta: { label: 'Review request', url: appUrl(`/approvals/${r._id}`) },
  });
}

export async function joinRequested(managerId: string, employeeName: string, employeeEmail: string, message: string) {
  await sendEmail(await emailOf(managerId), `${employeeName} wants to join your team`, {
    preheader: 'Accept or decline in Vista', eyebrow: 'Team request', title: `${employeeName} wants to join your team`,
    intro: 'Once you accept, they can apply for leave and their requests will come to you.',
    status: { label: 'Waiting for you', tone: 'pending' }, rows: [['Name', employeeName], ['Email', employeeEmail]],
    quote: message ? { by: employeeName, text: message } : undefined, cta: { label: 'Open team requests', url: appUrl('/team') },
  });
}

export async function joinDecided(employeeEmail: string, managerName: string, accepted: boolean, comment: string) {
  await sendEmail(employeeEmail, accepted ? `You're in ${managerName}'s team 🎉` : 'Your team request was declined', {
    preheader: accepted ? 'You can now apply for leave' : 'You can ask another manager',
    eyebrow: 'Team update', title: accepted ? `Welcome to ${managerName}'s team` : 'Team request declined',
    intro: accepted ? 'You can now apply for leave in Vista. Your requests go to your manager first.' : 'You can search for another manager and send a new request.',
    status: { label: accepted ? 'Accepted' : 'Declined', tone: accepted ? 'approved' : 'rejected' },
    quote: comment ? { by: managerName, text: comment } : undefined, cta: { label: accepted ? 'Apply for leave' : 'Find your manager', url: appUrl(accepted ? '/apply' : '/') },
  });
}
