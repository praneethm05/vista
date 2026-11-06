/**
 * Creates the three demo logins for evaluators (idempotent: safe to run again).
 *   Admin    → second-level (HOD) approver, audit log, all users
 *   Manager  → approves their team, accepts join requests
 *   Employee → already in the manager's team
 * Usage: npm run seed   (needs Password sign-in enabled in Clerk)
 * Emails use Clerk's `+clerk_test` sub-address: in dev instances any verification code is 424242, no email is sent.
 */
import mongoose from 'mongoose';
import { createClerkClient } from '@clerk/express';
import { User } from '../models/User.js';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Vista#Leave-2026!';

const DEMO = [
  { key: 'admin', firstName: 'Aditi', lastName: 'Rao', email: 'admin+clerk_test@vista-demo.com', role: 'ADMIN', code: 'VST-0001' },
  { key: 'manager', firstName: 'Meera', lastName: 'Menon', email: 'manager+clerk_test@vista-demo.com', role: 'MANAGER', code: 'VST-0002' },
  { key: 'employee', firstName: 'Arjun', lastName: 'Shetty', email: 'employee+clerk_test@vista-demo.com', role: 'EMPLOYEE', code: 'VST-0003' },
] as const;

async function ensureClerkUser(d: (typeof DEMO)[number]) {
  const { data } = await clerk.users.getUserList({ emailAddress: [d.email] });
  if (data[0]) {
    await clerk.users.updateUser(data[0].id, { password: DEMO_PASSWORD, skipPasswordChecks: true });
    return data[0].id;
  }
  const created = await clerk.users.createUser({
    emailAddress: [d.email],
    password: DEMO_PASSWORD,
    firstName: d.firstName,
    lastName: d.lastName,
    skipPasswordChecks: true,
  });
  return created.id;
}

await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'vista' });

// Remove the first-generation demo users (plain @vista-demo.com addresses could not receive codes).
for (const old of ['admin@vista-demo.com', 'manager@vista-demo.com', 'employee@vista-demo.com']) {
  const { data } = await clerk.users.getUserList({ emailAddress: [old] });
  for (const u of data) await clerk.users.deleteUser(u.id);
  await User.deleteMany({ email: old });
}
const ids: Record<string, string> = {};
for (const d of DEMO) ids[d.key] = await ensureClerkUser(d);

const department = 'Engineering';
const team = {
  admin: { managerId: null, hodId: null },
  manager: { managerId: ids.admin, hodId: ids.admin },
  employee: { managerId: ids.manager, hodId: ids.admin },
};
for (const d of DEMO) {
  await User.updateOne(
    { clerkId: ids[d.key] },
    { $set: { name: `${d.firstName} ${d.lastName}`, email: d.email, role: d.role, employeeCode: d.code, department, ...team[d.key] } },
    { upsert: true },
  );
}
await mongoose.disconnect();

console.log('\n✓ Demo accounts ready (password for all three: ' + DEMO_PASSWORD + ')');
for (const d of DEMO) console.log(`  ${d.role.padEnd(8)} ${d.email}`);
