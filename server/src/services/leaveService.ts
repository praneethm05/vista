import { Types } from 'mongoose';
import { LeaveRequest, type LeaveRequestDoc } from '../models/LeaveRequest.js';
import { AppError, notFound } from '../domain/errors.js';
import { addDays, calendarDays, parseDay, todayUtc, workingDays } from '../domain/dates.js';
import { getLeaveType, isLongLeave, needsDocument, LONG_LEAVE_THRESHOLD_DAYS } from '../domain/leaveTypes.js';
import { ACTIVE_STATUSES, transition, type Status, type Stage } from '../domain/workflow.js';
import type { CreateLeaveInput, RespondInput } from '../domain/schemas.js';
import type { CurrentUser } from '../auth/user.js';
import { getBalances } from './balanceService.js';
import { record, timeline } from './auditService.js';
import { assertOwned, linkToRequest, listMeta } from './documentService.js';
import { withLock } from './lockService.js';
import * as notify from '../mail/notifications.js';

/**
 * One submission per employee at a time: the overlap and balance checks plus the insert
 * run as one unit, so a double-click can't create two requests for the same dates.
 */
export function submit(user: CurrentUser, input: CreateLeaveInput) {
  return withLock(`submit:${user.id}`, () => submitUnlocked(user, input));
}

async function submitUnlocked(user: CurrentUser, input: CreateLeaveInput) {
  const type = getLeaveType(input.leaveType);
  const from = parseDay(input.fromDate);
  const to = parseDay(input.toDate);
  const days = calendarDays(from, to);
  const working = workingDays(from, to);

  if (!user.managerId || !user.hodId) {
    throw new AppError('NO_TEAM', 422, 'Join a team first: once your manager accepts you, you can apply for leave.');
  }
  if (from < addDays(todayUtc(), -type.backdateDays)) {
    const hint = type.backdateDays ? ` ${type.label} can start at most ${type.backdateDays} days ago.` : '';
    throw new AppError('DATE_IN_PAST', 400, `The start date is in the past.${hint}`, { fromDate: 'Too far in the past' });
  }
  if (days > 365) {
    throw new AppError('TOO_LONG', 400, 'A single request can be at most one year long.', { toDate: 'Too long' });
  }
  if (working === 0) {
    throw new AppError('NO_WORKING_DAYS', 422, 'These dates fall on a weekend, so no leave is needed.');
  }
  if (needsDocument(type, days) && input.documentIds.length === 0) {
    const why = type.documentAlways
      ? `${type.label} needs a supporting document.`
      : `Leave longer than ${LONG_LEAVE_THRESHOLD_DAYS} consecutive days needs a supporting document.`;
    throw new AppError('DOCUMENT_REQUIRED', 422, why, { documentIds: 'Required' });
  }
  await assertOwned(user, input.documentIds);
  await assertNoOverlap(user.id, from, to);
  await assertBalance(user.id, input.leaveType, working, from.getUTCFullYear());

  const request = await LeaveRequest.create({
    employeeId: user.id,
    employeeName: user.name,
    employeeEmail: user.email,
    department: user.department,
    managerId: user.managerId,
    hodId: user.hodId,
    leaveType: input.leaveType,
    fromDate: from,
    toDate: to,
    calendarDays: days,
    workingDays: working,
    reason: input.reason,
    documentIds: input.documentIds,
    // Second level only when it's a different person (e.g. a manager's own leave goes to the admin once).
    requiresHod: isLongLeave(days) && user.managerId !== user.hodId,
    status: 'PENDING_MANAGER',
    stage: 'MANAGER',
  });
  await linkToRequest(input.documentIds, request._id);
  await record(user, { requestId: request._id, action: 'SUBMITTED', toStatus: 'PENDING_MANAGER', comment: input.reason });
  await notify.leaveSubmitted(request.toObject() as LeaveRequestDoc);
  return request.toObject();
}

async function assertNoOverlap(employeeId: string, from: Date, to: Date) {
  const clash = await LeaveRequest.findOne({
    employeeId,
    status: { $in: ACTIVE_STATUSES },
    fromDate: { $lte: to },
    toDate: { $gte: from },
  }).lean();
  if (clash) {
    const range = `${clash.fromDate.toISOString().slice(0, 10)} to ${clash.toDate.toISOString().slice(0, 10)}`;
    throw new AppError('OVERLAP', 409, `You already have leave from ${range} that overlaps these dates.`);
  }
}

/** Checks against the quota of the year the leave starts in (leave applied in Nov for March uses next year's quota). */
export async function assertBalance(employeeId: string, leaveType: string, workingDayCount: number, year: number, excludeRequest?: LeaveRequestDoc) {
  const balance = (await getBalances(employeeId, year)).find((b) => b.code === leaveType);
  if (!balance || balance.available === null) return;
  // When re-checking at approval time, this request's own days are already counted as pending.
  const available = balance.available + (excludeRequest ? excludeRequest.workingDays : 0);
  if (workingDayCount > available) {
    throw new AppError(
      'INSUFFICIENT_BALANCE',
      422,
      `Not enough ${balance.label.toLowerCase()} for ${year}: you asked for ${workingDayCount} working days but have ${Math.max(available, 0)} left.`,
    );
  }
}

export async function listMine(user: CurrentUser, status?: string) {
  const filter: Record<string, unknown> = { employeeId: user.id };
  if (status) filter.status = { $in: status.split(',') };
  return LeaveRequest.find(filter).sort({ createdAt: -1 }).lean();
}

/** Owner, manager or HOD can read a request. Anyone else gets 404 (no information leak). */
export async function getVisible(user: CurrentUser, id: string): Promise<LeaveRequestDoc> {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const request = await LeaveRequest.findById(id).lean();
  const canSee = request && [request.employeeId, request.managerId, request.hodId].includes(user.id);
  if (!request || !canSee) throw notFound();
  return request as LeaveRequestDoc;
}

export async function getDetail(user: CurrentUser, id: string) {
  const request = await getVisible(user, id);
  const [history, documents] = await Promise.all([timeline(request._id), listMeta(request.documentIds as Types.ObjectId[])]);
  return { request, timeline: history, documents };
}

/**
 * Optimistic locking: only update if nobody changed the request since we read it.
 * Two approvers clicking at once → exactly one wins, the other gets 409.
 */
export async function applyTransition(
  request: LeaveRequestDoc,
  next: { status: Status; stage: Stage },
  extra: Record<string, unknown> = {},
) {
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, version: request.version, status: request.status },
    { $set: { status: next.status, stage: next.stage, ...extra }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) {
    throw new AppError('STALE', 409, 'Someone else just updated this request. Please refresh to see the latest status.');
  }
  return updated;
}

export async function cancel(user: CurrentUser, id: string) {
  const request = await getVisible(user, id);
  const next = transition(request as never, 'CANCEL', user);
  const updated = await applyTransition(request, next);
  await record(user, { requestId: request._id, action: 'CANCELLED', fromStatus: request.status, toStatus: next.status });
  return updated;
}

export async function respond(user: CurrentUser, id: string, input: RespondInput) {
  const request = await getVisible(user, id);
  const next = transition(request as never, 'RESPOND', user);
  await assertOwned(user, input.documentIds);
  const allDocs = [...request.documentIds.map(String), ...input.documentIds];
  const updated = await applyTransition(request, next, { documentIds: allDocs });
  await linkToRequest(input.documentIds, request._id);
  await record(user, {
    requestId: request._id,
    action: 'INFO_PROVIDED',
    fromStatus: request.status,
    toStatus: next.status,
    comment: input.comment,
    meta: { documentIds: input.documentIds },
  });
  await notify.infoProvided(updated as LeaveRequestDoc, input.comment);
  return updated;
}
