import { z } from 'zod';
import { Invite } from '../models/Invite.js';
import { User } from '../models/User.js';
import { AppError } from '../domain/errors.js';
import type { CurrentUser } from '../auth/user.js';
import { record } from './auditService.js';
import { appUrl, sendEmail } from '../mail/mailService.js';

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  name: z.string().trim().min(2, 'Enter their full name.').max(60),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).default('EMPLOYEE'),
  managerId: z.string().min(1).nullable().default(null),
  department: z.string().trim().min(1, 'Enter a department.').max(60),
  jobTitle: z.string().trim().max(60).default(''),
});

export async function createInvite(actor: CurrentUser, input: z.infer<typeof inviteSchema>) {
  if (await User.exists({ email: input.email })) throw new AppError('ALREADY_A_USER', 409, 'Someone with this email already uses Vista. Edit them in the tree instead.');
  if (input.role !== 'ADMIN') {
    if (!input.managerId) throw new AppError('MANAGER_REQUIRED', 400, 'Choose who they will report to.', { managerId: 'Required' });
    const manager = await User.findOne({ clerkId: input.managerId }).lean();
    if (!manager || !['MANAGER', 'ADMIN'].includes(manager.role)) throw new AppError('INVALID_MANAGER', 400, 'Pick a manager or admin.');
    if (input.role === 'MANAGER' && manager.role !== 'ADMIN') throw new AppError('INVALID_MANAGER', 400, 'Managers report to an admin (HOD).');
  }
  try {
    const invite = await Invite.create({ ...input, managerId: input.role === 'ADMIN' ? null : input.managerId, invitedBy: actor.id });
    await record(actor, { action: 'PERSON_INVITED', comment: `${input.name} <${input.email}> as ${input.role}`, meta: { inviteId: invite.id } });
    await sendEmail(input.email, "You've been added to Vista", {
      preheader: 'Sign in with this email to get started', eyebrow: 'Welcome', title: `Welcome to Vista, ${input.name.split(' ')[0]}`,
      intro: `Your account is ready. Sign in with ${input.email} and you'll land directly in your team, ready to apply for leave.`,
      rows: [['Role', input.role === 'ADMIN' ? 'Admin · HOD' : input.role === 'MANAGER' ? 'Manager' : 'Employee'], ['Department', input.department], ...(input.jobTitle ? [['Job title', input.jobTitle] as [string, string]] : [])],
      cta: { label: 'Sign in to Vista', url: appUrl('/') },
    });
    return invite.toObject();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError('ALREADY_INVITED', 409, 'This email already has an open invite.');
    throw err;
  }
}

export async function listOpenInvites() {
  return Invite.find({ claimedBy: null }).sort({ createdAt: -1 }).lean();
}

export async function cancelInvite(actor: CurrentUser, id: string) {
  const invite = await Invite.findOneAndDelete({ _id: id, claimedBy: null }).lean().catch(() => null);
  if (!invite) throw new AppError('NOT_FOUND', 404, 'Invite not found or already used.');
  await record(actor, { action: 'INVITE_CANCELLED', comment: invite.email });
  return { ok: true };
}

/** Called on a person's first sign-in: if the sysadmin pre-registered their email, apply it. */
export async function claimInvite(clerkId: string, email: string) {
  if (!email) return null;
  return Invite.findOneAndUpdate({ email: email.toLowerCase(), claimedBy: null }, { $set: { claimedBy: clerkId, claimedAt: new Date() } }, { returnDocument: 'after' }).lean();
}
