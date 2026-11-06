import { LeaveRequest } from '../models/LeaveRequest.js';
import { User } from '../models/User.js';
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

  return {
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
