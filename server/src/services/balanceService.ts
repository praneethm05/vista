import { LeaveRequest } from '../models/LeaveRequest.js';
import { LEAVE_TYPES, type LeaveTypeCode } from '../domain/leaveTypes.js';
import { ACTIVE_STATUSES } from '../domain/workflow.js';
import { getPolicy } from './settingsService.js';

export interface Balance {
  code: LeaveTypeCode;
  label: string;
  quota: number | null;
  used: number;
  pending: number;
  /** null when the leave type has no cap. */
  available: number | null;
}

/**
 * Balances are derived from the requests themselves (not a stored counter),
 * so they can never drift out of sync with what was actually approved.
 */
export async function getBalances(employeeId: string, year = new Date().getUTCFullYear()): Promise<Balance[]> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await LeaveRequest.aggregate<{ _id: { type: string; approved: boolean }; days: number }>([
    { $match: { employeeId, status: { $in: ACTIVE_STATUSES }, fromDate: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { type: '$leaveType', approved: { $eq: ['$status', 'APPROVED'] } },
        days: { $sum: '$workingDays' },
      },
    },
  ]);

  const { quotas } = await getPolicy();
  return LEAVE_TYPES.map((type) => {
    const quota = quotas[type.code] ?? type.quota;
    const used = rows.find((r) => r._id.type === type.code && r._id.approved)?.days ?? 0;
    const pending = rows.find((r) => r._id.type === type.code && !r._id.approved)?.days ?? 0;
    return {
      code: type.code,
      label: type.label,
      quota,
      used,
      pending,
      available: quota === null ? null : quota - used - pending,
    };
  });
}
