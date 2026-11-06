import { z } from 'zod';
import { User } from '../models/User.js';
import { AppError, notFound } from '../domain/errors.js';
import { forgetUser } from '../auth/requireAuth.js';
import type { CurrentUser } from '../auth/user.js';
import { record } from './auditService.js';

export const orgChangeSchema = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN'], { error: 'Choose employee, manager or admin.' }).optional(),
  managerId: z.string().min(1).nullable().optional(),
  department: z.string().trim().min(1).max(60).optional(),
});

/**
 * System admin reshapes the org: role, reporting line, department.
 * The second-level approver (hodId) is derived: the manager's own approver, or the manager if they are an admin.
 * Requests already in progress keep the approvers they were submitted with.
 */
export async function changeOrg(actor: CurrentUser, targetId: string, input: z.infer<typeof orgChangeSchema>) {
  const target = await User.findOne({ clerkId: targetId }).lean();
  if (!target) throw notFound('Person');
  if (target.role === 'SYSADMIN') throw new AppError('FORBIDDEN', 403, 'The system admin account cannot be changed here.');

  const role = input.role ?? target.role;
  let managerId = input.managerId === undefined ? target.managerId : input.managerId;
  if (role === 'ADMIN') managerId = null; // admins sit at the top

  const reports = await User.countDocuments({ managerId: targetId });
  if (role === 'EMPLOYEE' && reports > 0) {
    throw new AppError('HAS_REPORTS', 409, `${target.name} still has ${reports} people reporting to them. Move them to another manager first.`);
  }

  let hodId: string | null = null;
  if (managerId) {
    if (managerId === targetId) throw new AppError('SELF_MANAGER', 400, 'Someone cannot report to themselves.');
    const manager = await User.findOne({ clerkId: managerId }).lean();
    if (!manager || !['MANAGER', 'ADMIN'].includes(manager.role)) {
      throw new AppError('INVALID_MANAGER', 400, 'Pick a manager or admin as the reporting manager.');
    }
    if (role === 'MANAGER' && manager.role !== 'ADMIN') {
      throw new AppError('INVALID_MANAGER', 400, 'Managers report to an admin (HOD).');
    }
    // No loops: walk up from the new manager; we must never reach the person being moved.
    let cursor: string | null | undefined = manager.managerId;
    for (let depth = 0; cursor && depth < 20; depth++) {
      if (cursor === targetId) throw new AppError('CYCLE', 400, 'That would create a reporting loop.');
      cursor = (await User.findOne({ clerkId: cursor }).select('managerId').lean())?.managerId;
    }
    hodId = manager.role === 'ADMIN' ? manager.clerkId : (manager.hodId ?? manager.managerId ?? manager.clerkId);
  }

  const department = input.department ?? target.department;
  await User.updateOne({ clerkId: targetId }, { $set: { role, managerId, hodId, department } });
  forgetUser(targetId);

  // If a manager moved under a different admin, their reports' second-level approver follows.
  if (role === 'MANAGER') {
    const reportIds = (await User.find({ managerId: targetId }).select('clerkId').lean()).map((u) => u.clerkId);
    await User.updateMany({ managerId: targetId }, { $set: { hodId: hodId ?? targetId } });
    reportIds.forEach(forgetUser);
  }

  await record(actor, {
    action: 'ORG_CHANGED',
    comment: `${target.name}: ${target.role} → ${role}`,
    meta: { targetId, before: { role: target.role, managerId: target.managerId, department: target.department }, after: { role, managerId, department } },
  });
  return User.findOne({ clerkId: targetId }).lean();
}
