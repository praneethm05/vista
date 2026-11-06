import { AppError, notFound } from '../domain/errors.js';
import { TeamRequest } from '../models/TeamRequest.js';
import { User } from '../models/User.js';
import { forgetUser, toCurrentUser } from '../auth/requireAuth.js';
import type { CurrentUser } from '../auth/user.js';
import { record } from './auditService.js';

/** Managers an employee can ask to join. Search by name, email or employee code. */
export async function searchManagers(query = '') {
  const q = query.trim();
  const filter: Record<string, unknown> = { role: 'MANAGER' };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeCode: rx }];
  }
  const managers = await User.find(filter).sort({ name: 1 }).limit(20).lean();
  return managers.map((m) => ({ id: m.clerkId, name: m.name, email: m.email, employeeCode: m.employeeCode, department: m.department }));
}

export async function myRequest(user: CurrentUser) {
  return TeamRequest.findOne({ employeeId: user.id }).sort({ createdAt: -1 }).lean();
}

export async function requestToJoin(user: CurrentUser, managerId: string, message: string) {
  if (user.managerId) throw new AppError('ALREADY_IN_TEAM', 409, 'You are already part of a team.');
  if (user.role !== 'EMPLOYEE') throw new AppError('FORBIDDEN', 403, 'Only employees join a team this way.');
  const manager = await User.findOne({ clerkId: managerId, role: 'MANAGER' }).lean();
  if (!manager) throw new AppError('MANAGER_NOT_FOUND', 404, 'We could not find that manager. Check the name or ID and try again.');

  // Asking someone new replaces your earlier pending request.
  await TeamRequest.updateMany({ employeeId: user.id, status: 'PENDING' }, { $set: { status: 'WITHDRAWN' } });
  const request = await TeamRequest.create({
    employeeId: user.id,
    employeeName: user.name,
    employeeEmail: user.email,
    managerId,
    message: message.trim(),
  });
  await record(user, { action: 'TEAM_JOIN_REQUESTED', comment: message, meta: { managerId, managerName: manager.name } });
  return request.toObject();
}

export async function inbox(manager: CurrentUser) {
  return TeamRequest.find({ managerId: manager.id, status: 'PENDING' }).sort({ createdAt: 1 }).lean();
}

export async function decide(manager: CurrentUser, id: string, decision: 'ACCEPT' | 'REJECT', comment: string) {
  const request = await TeamRequest.findById(id).lean().catch(() => null);
  if (!request || request.managerId !== manager.id) throw notFound('Team request');

  // Only a still-pending request can be decided; a second click gets 409.
  const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
  const updated = await TeamRequest.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status, decisionComment: comment } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw new AppError('ALREADY_DECIDED', 409, 'This request was already handled.');

  if (decision === 'ACCEPT') {
    await User.updateOne(
      { clerkId: request.employeeId },
      { $set: { managerId: manager.id, hodId: manager.hodId ?? manager.id, department: manager.department } },
    );
    forgetUser(request.employeeId);
  }
  await record(manager, {
    action: decision === 'ACCEPT' ? 'TEAM_JOIN_ACCEPTED' : 'TEAM_JOIN_REJECTED',
    comment,
    meta: { employeeId: request.employeeId, employeeName: request.employeeName },
  });
  return updated;
}

export async function myTeam(manager: CurrentUser) {
  const members = await User.find({ managerId: manager.id }).sort({ name: 1 }).lean();
  return members.map(toCurrentUser);
}

/** Admin: everyone in the organisation. */
export async function allUsers() {
  const users = await User.find().sort({ role: 1, name: 1 }).lean();
  return users.map(toCurrentUser);
}
