import { LeaveRequest, type LeaveRequestDoc } from '../models/LeaveRequest.js';
import { ACTIVE_STATUSES, transition } from '../domain/workflow.js';
import type { ActionInput } from '../domain/schemas.js';
import type { CurrentUser } from '../auth/user.js';
import { getBalances } from './balanceService.js';
import { record } from './auditService.js';
import { applyTransition, assertBalance, getVisible } from './leaveService.js';

const ACTION_TO_AUDIT = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_INFO: 'INFO_REQUESTED' } as const;

/** Everything waiting on this approver: manager stage for their reports, HOD stage for their department. */
export async function queue(user: CurrentUser, scope: 'pending' | 'all' = 'pending') {
  const mine = [{ managerId: user.id }, { hodId: user.id }];
  const filter =
    scope === 'pending'
      ? { $or: [{ managerId: user.id, status: 'PENDING_MANAGER' }, { hodId: user.id, status: 'PENDING_HOD' }] }
      : { $or: mine, employeeId: { $ne: user.id } };
  const requests = await LeaveRequest.find(filter).sort({ fromDate: 1 }).limit(200).lean();
  return Promise.all(requests.map((r) => withInsights(r as LeaveRequestDoc)));
}

/**
 * The "insight" an approver needs to decide well:
 * - balance after approval
 * - teammates (same manager) already off on overlapping dates
 */
export async function withInsights(request: LeaveRequestDoc) {
  const [balances, clashes] = await Promise.all([
    getBalances(request.employeeId),
    LeaveRequest.find({
      _id: { $ne: request._id },
      managerId: request.managerId,
      employeeId: { $ne: request.employeeId },
      status: { $in: ACTIVE_STATUSES },
      fromDate: { $lte: request.toDate },
      toDate: { $gte: request.fromDate },
    })
      .select('employeeName fromDate toDate status')
      .lean(),
  ]);
  const balance = balances.find((b) => b.code === request.leaveType);
  return {
    ...request,
    insights: {
      balance: balance ?? null,
      // Pending already includes this request, so "after" = available as it stands.
      balanceAfterApproval: balance?.available ?? null,
      teamClashes: clashes,
    },
  };
}

export async function act(user: CurrentUser, id: string, input: ActionInput) {
  const request = await getVisible(user, id);
  const next = transition(request as never, input.action, user, input.comment);

  if (next.status === 'APPROVED') {
    // Re-check at approval time: other leave may have been approved since this was submitted.
    await assertBalance(request.employeeId, request.leaveType, request.workingDays, request);
  }

  const updated = await applyTransition(request, next, { lastComment: input.comment });
  await record(user, {
    requestId: request._id,
    action: next.status === 'PENDING_HOD' ? 'APPROVED_BY_MANAGER' : ACTION_TO_AUDIT[input.action],
    fromStatus: request.status,
    toStatus: next.status,
    comment: input.comment,
  });
  return updated;
}
