import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import type { CurrentUser } from '../auth/user.js';

interface AuditEntry {
  requestId?: Types.ObjectId | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  comment?: string;
  meta?: Record<string, unknown>;
}

export async function record(actor: CurrentUser, entry: AuditEntry) {
  await AuditLog.create({
    ...entry,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
  });
}

export async function timeline(requestId: Types.ObjectId | string) {
  return AuditLog.find({ requestId }).sort({ at: 1 }).lean();
}

export async function recent(limit = 100) {
  return AuditLog.find().sort({ at: -1 }).limit(limit).lean();
}
