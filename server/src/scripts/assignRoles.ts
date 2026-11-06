/**
 * One-time setup: give demo users their role and reporting line in Clerk publicMetadata.
 * Usage: npm run roles -- hod@x.com manager@x.com employee1@x.com [employee2@x.com ...]
 * (Each person must have signed in once so Clerk knows them.)
 */
import { createClerkClient } from '@clerk/express';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const [hodEmail, managerEmail, ...employeeEmails] = process.argv.slice(2);
if (!hodEmail || !managerEmail || employeeEmails.length === 0) {
  console.error('Usage: npm run roles -- <hodEmail> <managerEmail> <employeeEmail> [...]');
  process.exit(1);
}

async function idFor(email: string) {
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  if (!data[0]) throw new Error(`No Clerk user for ${email}. Ask them to sign in once first.`);
  return data[0].id;
}

const hodId = await idFor(hodEmail);
const managerId = await idFor(managerEmail);
const department = 'Engineering';

await clerk.users.updateUserMetadata(hodId, { publicMetadata: { role: 'HOD', department } });
await clerk.users.updateUserMetadata(managerId, { publicMetadata: { role: 'MANAGER', department, managerId: hodId, hodId } });
for (const email of employeeEmails) {
  await clerk.users.updateUserMetadata(await idFor(email), {
    publicMetadata: { role: 'EMPLOYEE', department, managerId, hodId },
  });
}
console.log(`✓ HOD ${hodEmail}, manager ${managerEmail}, employees ${employeeEmails.join(', ')}`);
