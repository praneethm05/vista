import type { NextFunction, Request, Response } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { AppError } from '../domain/errors.js';
import type { CurrentUser, Role } from './user.js';

const ROLES: Role[] = ['EMPLOYEE', 'MANAGER', 'HOD'];
const CACHE_MS = 30_000;
const cache = new Map<string, { user: CurrentUser; until: number }>();

/**
 * Verifies the Clerk session (done by clerkMiddleware) and loads role + reporting line
 * from Clerk publicMetadata. publicMetadata can only be changed server-side / in the
 * Clerk dashboard, so users can't promote themselves.
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

async function loadUser(userId: string): Promise<CurrentUser> {
  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.user;

  const clerkUser = await clerkClient.users.getUser(userId);
  const meta = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
  const role = ROLES.includes(meta.role as Role) ? (meta.role as Role) : 'EMPLOYEE';
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email || 'Employee';

  const user: CurrentUser = {
    id: userId,
    name,
    email,
    role,
    department: typeof meta.department === 'string' ? meta.department : 'General',
    managerId: typeof meta.managerId === 'string' ? meta.managerId : null,
    hodId: typeof meta.hodId === 'string' ? meta.hodId : null,
    avatarSeed: typeof meta.avatarSeed === 'string' ? meta.avatarSeed : email || userId,
  };
  cache.set(userId, { user, until: Date.now() + CACHE_MS });
  return user;
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 403, 'This page is only for approvers.');
    }
    next();
  };
}
