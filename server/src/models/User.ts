import { Schema, model } from 'mongoose';

/**
 * Vista's own user directory. Clerk proves *who* you are; this decides *what* you are
 * (role, team, approvers). New sign-ups start as employees without a team.
 */
const userSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    role: { type: String, enum: ['EMPLOYEE', 'MANAGER', 'ADMIN'], default: 'EMPLOYEE' },
    employeeCode: { type: String, required: true, unique: true },
    department: { type: String, default: 'Unassigned' },
    managerId: { type: String, default: null, index: true },
    hodId: { type: String, default: null },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
