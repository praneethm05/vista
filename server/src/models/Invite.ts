import { Schema, model } from 'mongoose';

/** A person added by the system admin before they sign up. Claimed on first sign-in with that email. */
const inviteSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['EMPLOYEE', 'MANAGER', 'ADMIN'], default: 'EMPLOYEE' },
    managerId: { type: String, default: null },
    department: { type: String, default: 'Unassigned' },
    jobTitle: { type: String, default: '' },
    invitedBy: { type: String, required: true },
    claimedBy: { type: String, default: null },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
// Only one open invite per email.
inviteSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { claimedBy: null } });

export const Invite = model('Invite', inviteSchema);
