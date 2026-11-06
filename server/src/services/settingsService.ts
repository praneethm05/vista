import { z } from 'zod';
import { Settings } from '../models/Settings.js';
import { LEAVE_TYPES, LEAVE_TYPE_CODES } from '../domain/leaveTypes.js';
import type { CurrentUser } from '../auth/user.js';
import { record } from './auditService.js';

export interface Policy {
  longLeaveThresholdDays: number;
  cancelNoticeDays: number;
  quotas: Record<string, number | null>;
}

const CACHE_MS = 15_000;
let cached: { policy: Policy; until: number } | null = null;

/** Effective policy = code defaults overridden by what the sysadmin saved. */
export async function getPolicy(): Promise<Policy> {
  if (cached && cached.until > Date.now()) return cached.policy;
  const doc = await Settings.findById('org').lean();
  const saved = (doc?.quotas ?? {}) as Record<string, number>;
  const quotas: Record<string, number | null> = {};
  for (const t of LEAVE_TYPES) quotas[t.code] = t.quota === null ? null : (saved[t.code] ?? t.quota);
  const policy = {
    longLeaveThresholdDays: doc?.longLeaveThresholdDays ?? 3,
    cancelNoticeDays: doc?.cancelNoticeDays ?? 2,
    quotas,
  };
  cached = { policy, until: Date.now() + CACHE_MS };
  return policy;
}

export const settingsSchema = z.object({
  longLeaveThresholdDays: z.coerce.number().int().min(1, 'At least 1 day.').max(30, 'At most 30 days.'),
  cancelNoticeDays: z.coerce.number().int().min(0, 'Cannot be negative.').max(60, 'At most 60 days.'),
  quotas: z
    .record(z.string(), z.coerce.number().int().min(0, 'Quota cannot be negative.').max(365, 'At most 365 days.'))
    .refine((q) => Object.keys(q).every((k) => (LEAVE_TYPE_CODES as string[]).includes(k)), 'Unknown leave type.')
    .default({}),
});

export async function updatePolicy(user: CurrentUser, input: z.infer<typeof settingsSchema>) {
  const before = await getPolicy();
  await Settings.updateOne({ _id: 'org' }, { $set: { ...input, updatedBy: user.name } }, { upsert: true });
  cached = null;
  const after = await getPolicy();
  await record(user, { action: 'SETTINGS_UPDATED', meta: { before, after } });
  return after;
}
