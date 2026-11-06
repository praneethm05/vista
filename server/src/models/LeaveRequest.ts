import { Schema, model, type InferSchemaType, Types } from 'mongoose';
import { LEAVE_TYPE_CODES } from '../domain/leaveTypes.js';

const STATUSES = ['PENDING_MANAGER', 'PENDING_HOD', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'];

const leaveRequestSchema = new Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, default: '' },
    department: { type: String, default: '' },
    // Approvers are copied from the employee's profile at submit time,
    // so a later org change doesn't silently move in-flight requests.
    managerId: { type: String, required: true },
    hodId: { type: String, required: true },
    leaveType: { type: String, enum: LEAVE_TYPE_CODES, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    calendarDays: { type: Number, required: true },
    workingDays: { type: Number, required: true },
    reason: { type: String, required: true },
    documentIds: [{ type: Types.ObjectId, ref: 'Document' }],
    requiresHod: { type: Boolean, required: true },
    status: { type: String, enum: STATUSES, required: true },
    stage: { type: String, enum: ['MANAGER', 'HOD'], required: true },
    /** Latest approver comment, shown on the employee's list. Full history lives in AuditLog. */
    lastComment: { type: String, default: '' },
    /** Optimistic-locking counter: every state change must match the version it read. */
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ employeeId: 1, fromDate: -1 });
leaveRequestSchema.index({ managerId: 1, status: 1 });
leaveRequestSchema.index({ hodId: 1, status: 1 });

export type LeaveRequestDoc = InferSchemaType<typeof leaveRequestSchema> & { _id: Types.ObjectId };
export const LeaveRequest = model('LeaveRequest', leaveRequestSchema);
