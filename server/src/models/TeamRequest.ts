import { Schema, model } from 'mongoose';

/** "So-and-so wants to join your team": created by an employee, decided by the manager. */
const teamRequestSchema = new Schema(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    managerId: { type: String, required: true },
    message: { type: String, default: '' },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'], default: 'PENDING' },
    decisionComment: { type: String, default: '' },
  },
  { timestamps: true },
);

teamRequestSchema.index({ managerId: 1, status: 1 });
// At most one pending request per employee, enforced by the database itself.
teamRequestSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });

export const TeamRequest = model('TeamRequest', teamRequestSchema);
