import { LeaveRequest } from '../models/LeaveRequest.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { LEAVE_TYPES } from '../domain/leaveTypes.js';
import { addDays, todayUtc } from '../domain/dates.js';
import type { CurrentUser } from '../auth/user.js';

/**
 * Dashboard numbers for whoever is looking:
 * manager → their direct reports, admin (HOD) / sysadmin → the whole organisation.
 */
export async function dashboard(user: CurrentUser) {
  const scope = user.role === 'MANAGER' ? { managerId: user.id } : {};
  const people = await User.find(user.role === 'MANAGER' ? { managerId: user.id } : { role: { $in: ['EMPLOYEE', 'MANAGER'] } })
    .select('clerkId name email role department')
    .sort({ name: 1 })
    .lean();
  const ids = people.map((p) => p.clerkId);

  const today = todayUtc();
  const in7 = addDays(today, 7);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const base = { ...scope, employeeId: { $in: ids } };

  const [pending, approvedThisMonth, byType, byStatus, current, upcoming] = await Promise.all([
    LeaveRequest.countDocuments({ ...base, status: { $in: ['PENDING_MANAGER', 'PENDING_HOD', 'INFO_REQUESTED'] } }),
    LeaveRequest.countDocuments({ ...base, status: 'APPROVED', fromDate: { $gte: monthStart } }),
    LeaveRequest.aggregate([
      { $match: { ...base, status: 'APPROVED', fromDate: { $gte: yearStart } } },
      { $group: { _id: '$leaveType', days: { $sum: '$workingDays' }, requests: { $sum: 1 } } },
    ]),
    LeaveRequest.aggregate([{ $match: { ...base, fromDate: { $gte: yearStart } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    LeaveRequest.find({ ...base, status: 'APPROVED', fromDate: { $lte: today }, toDate: { $gte: today } }).select('employeeId leaveType toDate').lean(),
    LeaveRequest.find({ ...base, status: { $in: ['APPROVED', 'PENDING_MANAGER', 'PENDING_HOD'] }, fromDate: { $gt: today, $lte: in7 } })
      .select('employeeId employeeName leaveType fromDate toDate status').sort({ fromDate: 1 }).lean(),
  ]);

  const onLeave = new Map(current.map((r) => [r.employeeId, r]));
  const roster = people.map((p) => {
    const away = onLeave.get(p.clerkId);
    return {
      id: p.clerkId, name: p.name, email: p.email, role: p.role, department: p.department,
      status: away ? 'ON_LEAVE' : 'WORKING',
      leaveType: away?.leaveType ?? null,
      backOn: away ? addDays(new Date(away.toDate), 1).toISOString().slice(0, 10) : null,
    };
  });

  const approvers = user.role === 'MANAGER' ? [] : await approverActivity(yearStart);

  return {
    approvers,
    scope: user.role === 'MANAGER' ? 'team' : 'organisation',
    headcount: people.length,
    onLeaveToday: current.length,
    pending,
    approvedThisMonth,
    byType: LEAVE_TYPES.map((t) => {
      const row = byType.find((b) => b._id === t.code);
      return { code: t.code, label: t.label, days: row?.days ?? 0, requests: row?.requests ?? 0 };
    }),
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    roster,
    upcoming,
  };
}

const DECISIONS = { APPROVED_BY_MANAGER: 'approved', APPROVED: 'approved', REJECTED: 'rejected', INFO_REQUESTED: 'askedInfo' } as const;

/**
 * Who decides, how often and how fast. Built from the audit log: for every decision we measure
 * the time since the previous event on that request (submitted, or the employee's reply).
 */
async function approverActivity(since: Date) {
  const logs = await AuditLog.find({ requestId: { $ne: null }, at: { $gte: since } })
    .select('requestId actorId actorName actorRole action at')
    .sort({ requestId: 1, at: 1 })
    .lean();
  const stats = new Map<string, { id: string; name: string; role: string; approved: number; rejected: number; askedInfo: number; totalMs: number; decisions: number }>();
  let lastRequest = '';
  let lastAt = 0;
  for (const log of logs) {
    const rid = String(log.requestId);
    if (rid !== lastRequest) { lastRequest = rid; lastAt = 0; }
    const kind = DECISIONS[log.action as keyof typeof DECISIONS];
    const at = new Date(log.at).getTime();
    if (kind) {
      const row = stats.get(log.actorId) ?? { id: log.actorId, name: log.actorName, role: log.actorRole, approved: 0, rejected: 0, askedInfo: 0, totalMs: 0, decisions: 0 };
      row[kind] += 1;
      if (lastAt) { row.totalMs += at - lastAt; row.decisions += 1; }
      stats.set(log.actorId, row);
    }
    lastAt = at;
  }
  const emails = new Map((await User.find({ clerkId: { $in: [...stats.keys()] } }).select('clerkId email role').lean()).map((u) => [u.clerkId, u]));
  return [...stats.values()]
    .map((r) => {
      const total = r.approved + r.rejected;
      return {
        id: r.id, name: r.name, role: emails.get(r.id)?.role ?? r.role, email: emails.get(r.id)?.email ?? '',
        approved: r.approved, rejected: r.rejected, askedInfo: r.askedInfo,
        approvalRate: total ? Math.round((r.approved / total) * 100) : null,
        avgResponseHours: r.decisions ? Math.round((r.totalMs / r.decisions / 3_600_000) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.approved + b.rejected + b.askedInfo - (a.approved + a.rejected + a.askedInfo));
}
