import type { NextFunction, Request, Response } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { AppError } from '../domain/errors.js';
import { User } from '../models/User.js';
import { claimInvite } from '../services/inviteService.js';
import type { CurrentUser, Role } from './user.js';

const CACHE_MS = 30_000;
const cache = new Map<string, { user: CurrentUser; until: number }>();

export function forgetUser(id: string) {
  cache.delete(id);
}

/**
 * Verifies the Clerk session (clerkMiddleware) and loads the Vista profile.
 * First sign-in creates the profile as an EMPLOYEE with no team: they must ask a manager to join.
 * Roles live only in our database, so nobody can promote themselves.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test') {
    const header = req.header('x-test-user');
    if (!header) throw new AppError('UNAUTHENTICATED', 401, 'Please sign in to continue.');
    req.user = JSON.parse(header) as CurrentUser;
    return next();
  }

  const { userId } = getAuth(req);
  if (!userId) throw new AppError('UNAUTHENTICATED', 401, 'Please sign in to continue.');
  req.user = await loadUser(userId);
  next();
}

async function loadUser(clerkId: string): Promise<CurrentUser> {
  const hit = cache.get(clerkId);
  if (hit && hit.until > Date.now()) return hit.user;

  let doc = await User.findOne({ clerkId }).lean();
  if (!doc) doc = (await createFromClerk(clerkId)).toObject();

  const user = toCurrentUser(doc);
  cache.set(clerkId, { user, until: Date.now() + CACHE_MS });
  return user;
}

async function createFromClerk(clerkId: string) {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'New employee';
  try {
    // Pre-registered by the system admin? Then they arrive with their role and team already set.
    const invite = await claimInvite(clerkId, email);
    if (invite) {
      const manager = invite.managerId ? await User.findOne({ clerkId: invite.managerId }).lean() : null;
      const hodId = !manager ? null : manager.role === 'ADMIN' ? manager.clerkId : (manager.hodId ?? manager.managerId ?? manager.clerkId);
      return await User.create({
        clerkId, name: invite.name, email, role: invite.role, employeeCode: await nextEmployeeCode(),
        department: invite.department, jobTitle: invite.jobTitle, managerId: invite.managerId, hodId,
      });
    }
    return await User.create({ clerkId, name, email, role: 'EMPLOYEE', employeeCode: await nextEmployeeCode() });
  } catch (err) {
    // Two first requests raced: the other one created the profile.
    const existing = await User.findOne({ clerkId });
    if (existing) return existing;
    throw err;
  }
}

export async function nextEmployeeCode() {
  const count = await User.countDocuments();
  return `VST-${1001 + count}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}

export function toCurrentUser(doc: { clerkId: string; name: string; email: string; role: string; department?: string | null; employeeCode: string; jobTitle?: string | null; phone?: string | null; location?: string | null; managerId?: string | null; hodId?: string | null }): CurrentUser {
  return {
    id: doc.clerkId,
    name: doc.name,
    email: doc.email,
    role: doc.role as Role,
    department: doc.department ?? 'Unassigned',
    employeeCode: doc.employeeCode,
    jobTitle: doc.jobTitle ?? '',
    phone: doc.phone ?? '',
    location: doc.location ?? '',
    managerId: doc.managerId ?? null,
    hodId: doc.hodId ?? null,
    avatarSeed: doc.email || doc.clerkId,
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 403, "You don't have access to this page.");
    }
    next();
  };
}
