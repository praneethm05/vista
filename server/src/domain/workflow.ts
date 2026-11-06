import { AppError } from './errors.js';

/**
 * The approval workflow as a pure state machine. No database, no HTTP:
 * easy to unit-test and the single place that decides what may happen next.
 *
 *   PENDING_MANAGER ─approve─► APPROVED            (≤ 3 days)
 *   PENDING_MANAGER ─approve─► PENDING_HOD ─approve─► APPROVED   (> 3 days)
 *   any pending ─reject─► REJECTED
 *   any pending ─request info─► INFO_REQUESTED ─employee responds─► back to the stage that asked
 *   any pending / INFO_REQUESTED ─employee cancels─► CANCELLED
 */
export type Status =
  | 'PENDING_MANAGER' | 'PENDING_HOD' | 'INFO_REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type Stage = 'MANAGER' | 'HOD';
export type Action = 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'RESPOND' | 'CANCEL';
export const APPROVER_ACTIONS = ['APPROVE', 'REJECT', 'REQUEST_INFO'] as const;

export const OPEN_STATUSES: Status[] = ['PENDING_MANAGER', 'PENDING_HOD', 'INFO_REQUESTED'];
/** Statuses that hold the employee's dates and balance. */
export const ACTIVE_STATUSES: Status[] = [...OPEN_STATUSES, 'APPROVED'];

export interface WorkflowRequest {
  employeeId: string;
  managerId: string;
  hodId: string;
  requiresHod: boolean;
  status: Status;
  stage: Stage;
}

export interface Actor {
  id: string;
}

/** Facts the cancel rule needs; kept out of WorkflowRequest so the machine stays pure and testable. */
export interface CancelContext {
  daysUntilStart: number;
  noticeDays: number;
}

export interface Transition {
  status: Status;
  stage: Stage;
}

export function transition(
  request: WorkflowRequest,
  action: Action,
  actor: Actor,
  comment?: string,
  cancelContext?: CancelContext,
): Transition {
  if (action === 'CANCEL') return cancel(request, actor, cancelContext);
  if (action === 'RESPOND') return respond(request, actor);
  return decide(request, action, actor, comment);
}

function cancel(request: WorkflowRequest, actor: Actor, ctx?: CancelContext): Transition {
  if (actor.id !== request.employeeId) {
    throw new AppError('FORBIDDEN', 403, 'Only the employee who applied can cancel this request.');
  }
  // Approved leave can be taken back only with enough notice before it starts.
  if (request.status === 'APPROVED' && ctx) {
    if (ctx.daysUntilStart < ctx.noticeDays) {
      throw new AppError('TOO_LATE_TO_CANCEL', 409, `Approved leave can be taken back up to ${ctx.noticeDays} day${ctx.noticeDays === 1 ? '' : 's'} before it starts. Please talk to your manager.`);
    }
    return { status: 'CANCELLED', stage: request.stage };
  }
  if (!OPEN_STATUSES.includes(request.status)) {
    throw new AppError('NOT_CANCELLABLE', 409, `This request is already ${label(request.status)} and can no longer be cancelled.`);
  }
  return { status: 'CANCELLED', stage: request.stage };
}

function respond(request: WorkflowRequest, actor: Actor): Transition {
  if (actor.id !== request.employeeId) {
    throw new AppError('FORBIDDEN', 403, 'Only the employee who applied can respond.');
  }
  if (request.status !== 'INFO_REQUESTED') {
    throw new AppError('NO_INFO_REQUESTED', 409, 'Nobody has asked for more information on this request.');
  }
  return { status: request.stage === 'HOD' ? 'PENDING_HOD' : 'PENDING_MANAGER', stage: request.stage };
}

function decide(
  request: WorkflowRequest,
  action: Action,
  actor: Actor,
  comment?: string,
): Transition {
  if (actor.id === request.employeeId) {
    throw new AppError('SELF_APPROVAL', 403, 'You cannot approve or reject your own leave.');
  }
  const expectedApprover = request.status === 'PENDING_HOD' ? request.hodId : request.managerId;
  const isPending = request.status === 'PENDING_MANAGER' || request.status === 'PENDING_HOD';
  if (!isPending) {
    throw new AppError('NOT_PENDING', 409, `This request is ${label(request.status)}, so there is nothing to decide right now.`);
  }
  if (actor.id !== expectedApprover) {
    throw new AppError('NOT_YOUR_APPROVAL', 403, `This request is waiting for the ${request.status === 'PENDING_HOD' ? 'HOD' : 'manager'}, not you.`);
  }
  if ((action === 'REJECT' || action === 'REQUEST_INFO') && !comment?.trim()) {
    const verb = action === 'REJECT' ? 'rejecting' : 'asking for more information';
    throw new AppError('COMMENT_REQUIRED', 400, `Please add a comment when ${verb}, so the employee knows why.`, { comment: 'Required' });
  }

  if (action === 'REJECT') return { status: 'REJECTED', stage: request.stage };
  if (action === 'REQUEST_INFO') return { status: 'INFO_REQUESTED', stage: request.stage };

  // APPROVE
  if (request.status === 'PENDING_MANAGER' && request.requiresHod) {
    return { status: 'PENDING_HOD', stage: 'HOD' };
  }
  return { status: 'APPROVED', stage: request.stage };
}

const LABELS: Record<Status, string> = {
  PENDING_MANAGER: 'waiting for the manager',
  PENDING_HOD: 'waiting for the HOD',
  INFO_REQUESTED: 'waiting for more information',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export function label(status: Status): string {
  return LABELS[status];
}
