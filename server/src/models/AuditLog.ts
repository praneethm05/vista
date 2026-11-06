import { Schema, model } from 'mongoose';

/** Append-only: the app only ever inserts audit entries, never updates or deletes them. */
const auditLogSchema = new Schema({
  requestId: { type: Schema.Types.ObjectId, ref: 'LeaveRequest', index: true },
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, default: null },
  comment: { type: String, default: '' },
  meta: { type: Schema.Types.Mixed, default: {} },
  at: { type: Date, default: () => new Date() },
});

auditLogSchema.index({ requestId: 1, at: 1 });

export const AuditLog = model('AuditLog', auditLogSchema);
