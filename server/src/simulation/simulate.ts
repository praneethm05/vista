/**
 * Corporate simulation: 20 people (1 admin, 3 managers, 16 employees) using Vista for a quarter.
 * Runs the real Express app against an in-memory MongoDB (auth via the test header, no Clerk).
 * Every scenario asserts the expected HTTP status; results + insights go to docs/SIMULATION.md.
 *   npm run simulate
 */
process.env.NODE_ENV = 'test';
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../createApp.js';
import { User } from '../models/User.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { AuditLog } from '../models/AuditLog.js';
import { addDays, formatDay, todayUtc } from '../domain/dates.js';

const app = createApp({ connect: false });
type P = { id: string; name: string; email: string; role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN'; department: string; employeeCode: string; managerId: string | null; hodId: string | null; avatarSeed: string };
const people: Record<string, P> = {};
const results: { area: string; scenario: string; expected: number; actual: number; code?: string; ok: boolean }[] = [];

function person(id: string, name: string, role: P['role'], department: string, managerId: string | null, hodId: string | null) {
  people[id] = { id, name, email: `${id}@acme.in`, role, department, employeeCode: `VST-${1000 + Object.keys(people).length}`, managerId, hodId, avatarSeed: id };
}
const as = (id: string) => ({ 'x-test-user': JSON.stringify(people[id]) });
let monday = addDays(todayUtc(), 14);
while (monday.getUTCDay() !== 1) monday = addDays(monday, 1);
const d = (offset: number) => formatDay(addDays(monday, offset));

async function check(area: string, scenario: string, expected: number, req: Promise<request.Response>) {
  const res = await req;
  results.push({ area, scenario, expected, actual: res.status, code: res.body?.error?.code, ok: res.status === expected });
  return res;
}
const apply = (who: string, body: object) => request(app).post('/api/leaves').set(as(who)).send(body);
const act = (who: string, id: string, action: string, comment = '') => request(app).post(`/api/approvals/${id}/actions`).set(as(who)).send({ action, comment });
async function doc(who: string) {
  const r = await request(app).post('/api/documents').set(as(who)).attach('file', Buffer.from('%PDF-1.4 sim'), { filename: 'proof.pdf', contentType: 'application/pdf' });
  return r.body.id as string;
}

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
const t0 = Date.now();

// ── Org: Admin (HOD) → 3 managers → 16 employees ─────────────────────────────
person('admin', 'Aditi Rao', 'ADMIN', 'Leadership', null, null);
const teams = { eng: 'Engineering', ops: 'Operations', cx: 'Customer Experience' } as const;
const managers = { eng: 'm-eng', ops: 'm-ops', cx: 'm-cx' };
person('m-eng', 'Meera Menon', 'MANAGER', teams.eng, 'admin', 'admin');
person('m-ops', 'Karan Shah', 'MANAGER', teams.ops, 'admin', 'admin');
person('m-cx', 'Fatima Khan', 'MANAGER', teams.cx, 'admin', 'admin');
const names = ['Arjun', 'Priya', 'Rahul', 'Sneha', 'Vikram', 'Ananya', 'Rohan', 'Divya', 'Kabir', 'Isha', 'Nikhil', 'Pooja', 'Siddharth', 'Tara', 'Yash', 'Zoya'];
const empIds: string[] = [];
names.forEach((n, i) => {
  const team = (['eng', 'eng', 'eng', 'eng', 'eng', 'eng', 'ops', 'ops', 'ops', 'ops', 'ops', 'cx', 'cx', 'cx', 'cx', 'cx'] as const)[i];
  const id = `e-${n.toLowerCase()}`;
  empIds.push(id);
  // Zoya is a brand-new joiner without a team (tests the join flow)
  if (n === 'Zoya') person(id, `${n} Mirza`, 'EMPLOYEE', 'Unassigned', null, null);
  else person(id, `${n} ${['Iyer', 'Nair', 'Gupta', 'Reddy', 'Das'][i % 5]}`, 'EMPLOYEE', teams[team], managers[team], 'admin');
});
for (const p of Object.values(people)) {
  await User.create({ clerkId: p.id, name: p.name, email: p.email, role: p.role, employeeCode: p.employeeCode, department: p.department, managerId: p.managerId, hodId: p.hodId });
}

// ── 1. Everyday usage: short leave, manager approves ─────────────────────────
const shortIds: string[] = [];
for (const [i, e] of empIds.slice(0, 15).entries()) {
  const r = await check('Everyday', `${people[e].name}: 1-day casual leave`, 201, apply(e, { leaveType: 'CASUAL', fromDate: d(7 * (i % 6) + (i % 5)), toDate: d(7 * (i % 6) + (i % 5)), reason: 'Personal errand' }));
  shortIds.push(r.body._id);
}
for (const [i, id] of shortIds.entries()) {
  const e = empIds[i];
  const decision = i % 7 === 3 ? 'REJECT' : 'APPROVE';
  await check('Everyday', `Manager ${decision === 'APPROVE' ? 'approves' : 'rejects'} ${people[e].name}'s casual leave`, 200, act(people[e].managerId!, id, decision, decision === 'REJECT' ? 'Quarter-end close, please move it' : 'Enjoy'));
}

// ── 2. Long leave: documents + Manager → Admin (HOD) ──────────────────────────
const arjun = 'e-arjun';
await check('Long leave', '5 days, no document → blocked', 422, apply(arjun, { leaveType: 'ANNUAL', fromDate: d(56), toDate: d(60), reason: 'Family wedding' }));
const long = await check('Long leave', '5 days with document → submitted (needs HOD)', 201, apply(arjun, { leaveType: 'ANNUAL', fromDate: d(56), toDate: d(60), reason: 'Family wedding', documentIds: [await doc(arjun)] }));
await check('Long leave', 'Admin tries to approve before manager → wrong stage', 403, act('admin', long.body._id, 'APPROVE'));
await check('Long leave', 'Manager approves → goes to HOD', 200, act('m-eng', long.body._id, 'APPROVE'));
await check('Long leave', 'Manager tries again at HOD stage → not their stage', 403, act('m-eng', long.body._id, 'APPROVE'));
await check('Long leave', 'Admin asks for info without comment → blocked', 400, act('admin', long.body._id, 'REQUEST_INFO'));
await check('Long leave', 'Admin asks who covers on-call', 200, act('admin', long.body._id, 'REQUEST_INFO', 'Who covers on-call?'));
await check('Long leave', 'Admin cannot approve while waiting for info', 409, act('admin', long.body._id, 'APPROVE'));
await check('Long leave', 'Employee replies → back to HOD', 200, request(app).post(`/api/leaves/${long.body._id}/respond`).set(as(arjun)).send({ comment: 'Rahul covers on-call' }));
await check('Long leave', 'Admin approves → APPROVED', 200, act('admin', long.body._id, 'APPROVE', 'Have fun'));
await check('Long leave', 'Exactly 3 days, no document → allowed (threshold is >3)', 201, apply('e-priya', { leaveType: 'ANNUAL', fromDate: d(64), toDate: d(66), reason: 'Short trip' }));
await check('Long leave', 'Fri→Mon = 4 calendar days (2 working) still needs document', 422, apply('e-priya', { leaveType: 'ANNUAL', fromDate: d(74), toDate: d(77), reason: 'Long weekend' }));
await check('Long leave', 'Parental leave always needs a document', 422, apply('e-sneha', { leaveType: 'PARENTAL', fromDate: d(84), toDate: d(84), reason: 'Adoption' }));

// ── 3. Validation ────────────────────────────────────────────────────────────
const rahul = 'e-rahul';
await check('Validation', 'End date before start date', 400, apply(rahul, { leaveType: 'ANNUAL', fromDate: d(10), toDate: d(8), reason: 'Trip' }));
await check('Validation', 'Impossible date 2026-02-30', 400, apply(rahul, { leaveType: 'ANNUAL', fromDate: '2026-02-30', toDate: '2026-02-30', reason: 'Trip' }));
await check('Validation', 'Missing reason', 400, apply(rahul, { leaveType: 'ANNUAL', fromDate: d(10), toDate: d(10) }));
await check('Validation', 'Reason over 500 chars', 400, apply(rahul, { leaveType: 'ANNUAL', fromDate: d(10), toDate: d(10), reason: 'x'.repeat(501) }));
await check('Validation', 'Unknown leave type', 400, apply(rahul, { leaveType: 'BEACH', fromDate: d(10), toDate: d(10), reason: 'Trip' }));
await check('Validation', 'Weekend-only request', 422, apply(rahul, { leaveType: 'ANNUAL', fromDate: d(5), toDate: d(6), reason: 'Trip' }));
await check('Validation', 'Casual leave in the past', 400, apply(rahul, { leaveType: 'CASUAL', fromDate: formatDay(addDays(todayUtc(), -3)), toDate: formatDay(addDays(todayUtc(), -3)), reason: 'Forgot to apply' }));
let lastWeekday = addDays(todayUtc(), -4);
while ([0, 6].includes(lastWeekday.getUTCDay())) lastWeekday = addDays(lastWeekday, -1);
await check('Validation', `Sick leave back-dated to ${formatDay(lastWeekday)} (weekday, within 7 days) → allowed`, 201, apply(rahul, { leaveType: 'SICK', fromDate: formatDay(lastWeekday), toDate: formatDay(lastWeekday), reason: 'Fever' }));
await check('Validation', 'Sick leave back-dated 10 days → blocked', 400, apply(rahul, { leaveType: 'SICK', fromDate: formatDay(addDays(todayUtc(), -10)), toDate: formatDay(addDays(todayUtc(), -10)), reason: 'Fever' }));
await check('Validation', 'Request longer than 1 year', 400, apply(rahul, { leaveType: 'WELLNESS', fromDate: d(0), toDate: d(400), reason: 'Treatment', documentIds: [await doc(rahul)] }));
await check('Validation', "Attach someone else's document", 400, apply(rahul, { leaveType: 'ANNUAL', fromDate: d(90), toDate: d(95), reason: 'Trip', documentIds: [await doc('e-sneha')] }));
await check('Validation', 'Upload a .txt file', 415, request(app).post('/api/documents').set(as(rahul)).attach('file', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' }));
await check('Validation', 'Upload a 5 MB file', 413, request(app).post('/api/documents').set(as(rahul)).attach('file', Buffer.alloc(5 * 1024 * 1024), { filename: 'big.pdf', contentType: 'application/pdf' }));

// ── 4. Overlaps & balances ───────────────────────────────────────────────────
const vikram = 'e-vikram';
const v1 = await apply(vikram, { leaveType: 'ANNUAL', fromDate: d(100), toDate: d(101), reason: 'Trip' });
await check('Overlap', 'Overlapping pending request', 409, apply(vikram, { leaveType: 'SICK', fromDate: d(101), toDate: d(102), reason: 'Unwell' }));
await request(app).post(`/api/leaves/${v1.body._id}/cancel`).set(as(vikram));
await check('Overlap', 'Same dates after cancelling → allowed', 201, apply(vikram, { leaveType: 'ANNUAL', fromDate: d(100), toDate: d(101), reason: 'Trip again' }));
await check('Balance', 'Pet leave 3 days (quota 2)', 422, apply('e-ananya', { leaveType: 'PET', fromDate: d(105), toDate: d(107), reason: 'Puppy' }));
await check('Balance', 'Casual 3 days pending (same year as her 1 approved day)', 201, apply('e-ananya', { leaveType: 'CASUAL', fromDate: d(112), toDate: d(114), reason: 'Errands', documentIds: [] }));
await check('Balance', 'Casual 4 more days (3 pending + 4 > 6 quota)', 422, apply('e-ananya', { leaveType: 'CASUAL', fromDate: d(119), toDate: d(122), reason: 'More errands', documentIds: [await doc('e-ananya')] }));
await check('Balance', 'Wellness (no cap) 20 working days with document', 201, apply('e-divya', { leaveType: 'WELLNESS', fromDate: d(126), toDate: d(151), reason: 'Surgery recovery', documentIds: [await doc('e-divya')] }));

// ── 5. Security & access ─────────────────────────────────────────────────────
const target = shortIds[0];
await check('Security', "Employee reads a colleague's leave → 404", 404, request(app).get(`/api/leaves/${target}`).set(as('e-priya')));
await check('Security', 'Employee opens dashboard stats → 403', 403, request(app).get('/api/stats').set(as('e-priya')));
await check('Security', 'Manager changes org settings → 403', 403, request(app).put('/api/settings').set(as('m-eng')).send({ longLeaveThresholdDays: 10, cancelNoticeDays: 0 }));
await check('Security', "Manager of another team reads it → 404", 404, request(app).get(`/api/leaves/${target}`).set(as('m-ops')));
await check('Security', 'Employee opens approvals → 403', 403, request(app).get('/api/approvals').set(as('e-priya')));
await check('Security', 'Employee opens audit log → 403', 403, request(app).get('/api/audit').set(as('e-priya')));
await check('Security', 'Manager opens audit log → 403', 403, request(app).get('/api/audit').set(as('m-eng')));
await check('Security', 'No login → 401', 401, request(app).get('/api/me'));
await check('Security', 'Malformed id → 404 (no crash)', 404, request(app).get('/api/leaves/not-an-id').set(as('e-priya')));
const priyaPending = await apply('e-priya', { leaveType: 'SICK', fromDate: d(130), toDate: d(130), reason: 'Checkup' });
await check('Security', "Manager from another team approves → 404 (can't even see it)", 404, act('m-ops', priyaPending.body._id, 'APPROVE'));
await check('Security', 'Employee approves own request → 403', 403, act('e-priya', priyaPending.body._id, 'APPROVE'));

// ── 6. Workflow edge cases ───────────────────────────────────────────────────
await check('Workflow', 'Reject without comment', 400, act('m-eng', priyaPending.body._id, 'REJECT'));
await check('Workflow', 'Employee cancels pending request', 200, request(app).post(`/api/leaves/${priyaPending.body._id}/cancel`).set(as('e-priya')));
await check('Workflow', 'Manager approves a cancelled request', 409, act('m-eng', priyaPending.body._id, 'APPROVE'));
await check('Workflow', 'Take back approved leave well before it starts → allowed, balance restored', 200, request(app).post(`/api/leaves/${shortIds[0]}/cancel`).set(as(empIds[0])));
let soon = todayUtc(); while ([0, 6].includes(soon.getUTCDay())) soon = addDays(soon, 1);
const late = await apply('e-tara', { leaveType: 'SICK', fromDate: formatDay(soon), toDate: formatDay(soon), reason: 'Unwell' });
await act('m-cx', late.body._id, 'APPROVE');
await check('Workflow', 'Take back approved leave that starts today → too late (2-day notice)', 409, request(app).post(`/api/leaves/${late.body._id}/cancel`).set(as('e-tara')));
await check('Workflow', 'Reply when no info was requested', 409, request(app).post(`/api/leaves/${long.body._id}/respond`).set(as(arjun)).send({ comment: 'hello there' }));
const mgrLeave = await check('Workflow', 'Manager applies for 5 days (with doc)', 201, apply('m-eng', { leaveType: 'ANNUAL', fromDate: d(140), toDate: d(144), reason: 'Vacation', documentIds: [await doc('m-eng')] }));
await check('Workflow', "Admin approves manager's leave in one step", 200, act('admin', mgrLeave.body._id, 'APPROVE'));
const mgrFinal = await LeaveRequest.findById(mgrLeave.body._id).lean();

// ── 7. Concurrency ───────────────────────────────────────────────────────────
const race = await apply('e-kabir', { leaveType: 'CASUAL', fromDate: d(150), toDate: d(150), reason: 'Bank' });
const [ra, rb] = await Promise.all([act('m-ops', race.body._id, 'APPROVE'), act('m-ops', race.body._id, 'REJECT', 'No')]);
results.push({ area: 'Concurrency', scenario: 'Approve + reject at the same moment → exactly one wins', expected: 1, actual: [ra.status, rb.status].filter((s) => s === 200).length, ok: [ra.status, rb.status].sort().join() === '200,409' });
const dbl = await Promise.all([1, 2, 3].map(() => apply('e-isha', { leaveType: 'ANNUAL', fromDate: d(161), toDate: d(161), reason: 'Double click' })));
const created = dbl.filter((r) => r.status === 201).length;
const dblCodes = dbl.map((r) => r.body?.error?.code ?? r.status).join(', ');
results.push({ area: 'Concurrency', scenario: 'Triple-click Submit (3 identical requests at once) → only one created', expected: 1, actual: created, code: dblCodes, ok: created === 1 });

// ── 8. Team clash insight ────────────────────────────────────────────────────
for (const e of ['e-nikhil', 'e-pooja']) await apply(e, { leaveType: 'ANNUAL', fromDate: d(170), toDate: d(171), reason: 'Diwali travel' });
const clashReq = await apply('e-rohan', { leaveType: 'ANNUAL', fromDate: d(171), toDate: d(172), reason: 'Diwali travel' });
const clashView = await request(app).get(`/api/approvals/${clashReq.body._id}`).set(as('m-ops'));
const clashes = clashView.body.request?.insights?.teamClashes?.length ?? 0;

// ── 9. Join a team ───────────────────────────────────────────────────────────
const zoya = 'e-zoya';
await check('Join team', 'Zoya (no team) applies for leave → blocked', 422, apply(zoya, { leaveType: 'CASUAL', fromDate: d(10), toDate: d(10), reason: 'Errand' }));
await check('Join team', 'Asks a non-manager (an employee) → not found', 404, request(app).post('/api/team/join-request').set(as(zoya)).send({ managerId: 'e-arjun' }));
await check('Join team', 'Asks Karan (Ops)', 201, request(app).post('/api/team/join-request').set(as(zoya)).send({ managerId: 'm-ops', message: 'Joined Ops' }));
await check('Join team', 'Changes mind, asks Fatima (CX) → replaces request', 201, request(app).post('/api/team/join-request').set(as(zoya)).send({ managerId: 'm-cx' }));
const opsInbox = await request(app).get('/api/team/requests').set(as('m-ops'));
const cxInbox = await request(app).get('/api/team/requests').set(as('m-cx'));
results.push({ area: 'Join team', scenario: "Karan's inbox no longer shows the withdrawn request", expected: 0, actual: opsInbox.body.length, ok: opsInbox.body.length === 0 });
await check('Join team', 'Karan tries to accept the request sent to Fatima → 404', 404, request(app).post(`/api/team/requests/${cxInbox.body[0]._id}/decision`).set(as('m-ops')).send({ decision: 'ACCEPT' }));
await check('Join team', 'Fatima accepts', 200, request(app).post(`/api/team/requests/${cxInbox.body[0]._id}/decision`).set(as('m-cx')).send({ decision: 'ACCEPT' }));
await check('Join team', 'Fatima double-clicks accept → 409', 409, request(app).post(`/api/team/requests/${cxInbox.body[0]._id}/decision`).set(as('m-cx')).send({ decision: 'ACCEPT' }));
await check('Join team', 'Employee (Arjun) opens join inbox → 403', 403, request(app).get('/api/team/requests').set(as(arjun)));
people[zoya] = { ...people[zoya], managerId: 'm-cx', hodId: 'admin', department: teams.cx }; // what the next login sees
await check('Join team', 'Zoya can now apply', 201, apply(zoya, { leaveType: 'CASUAL', fromDate: d(10), toDate: d(10), reason: 'Errand' }));

// ── 10. Year boundary ────────────────────────────────────────────────────────
const y = todayUtc().getUTCFullYear();
const yb = await apply('e-yash', { leaveType: 'ANNUAL', fromDate: `${y}-12-28`, toDate: `${y + 1}-01-01`, reason: 'New year trip', documentIds: [await doc('e-yash')] });
const ybMe = await request(app).get('/api/me').set(as('e-yash'));
const ybPending = ybMe.body.balances.find((b: { code: string }) => b.code === 'ANNUAL').pending;

// ── Report ───────────────────────────────────────────────────────────────────
const statusCounts = await LeaveRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
const byType = await LeaveRequest.aggregate([{ $group: { _id: '$leaveType', n: { $sum: 1 }, days: { $sum: '$workingDays' } } }, { $sort: { n: -1 } }]);
const auditCount = await AuditLog.countDocuments();
const passed = results.filter((r) => r.ok).length;
const ms = Date.now() - t0;

const lines = [
  '# Vista: corporate simulation report',
  '',
  `Generated by \`npm run simulate\`: the real Express API against an in-memory MongoDB, ${Object.keys(people).length} people (1 Admin/HOD, 3 managers, 16 employees across Engineering, Operations and Customer Experience).`,
  '',
  `**${passed}/${results.length} scenarios behaved as expected** · ${await LeaveRequest.countDocuments()} leave requests · ${auditCount} audit entries · ${ms} ms`,
  '',
  '| Area | Scenario | Expected | Actual | Code | |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.area} | ${r.scenario} | ${r.expected} | ${r.actual} | ${r.code ?? ''} | ${r.ok ? '✅' : '❌'} |`),
  '',
  '## Data snapshot',
  '',
  `- Requests by status: ${statusCounts.map((s) => `${s._id} ${s.n}`).join(' · ')}`,
  `- Requests by type: ${byType.map((t) => `${t._id} ${t.n} (${t.days} working days)`).join(' · ')}`,
  `- Manager's own 5-day leave: requiresHod=${mgrFinal?.requiresHod}, final status ${mgrFinal?.status} after a single Admin approval`,
  `- Team clash insight: Rohan's request showed ${clashes} Ops teammates already off`,
  `- Year-boundary leave (28 Dec → 1 Jan): ${ybPending} working days counted against ${y}'s balance (status ${yb.status})`,
  '',
  '## Bugs this simulation found (now fixed)',
  '',
  '1. **Balance checked against the wrong year.** Leave applied now for next March was checked against this year\'s quota, so next year\'s quota was never enforced. Fix: check the quota of the year the leave starts in (submit and final approval).',
  '2. **Double-click created duplicate requests.** The overlap check and the insert were separate steps, so 3 simultaneous submits created 3 requests. Fix: a per-employee MongoDB lock (unique `_id` + TTL), so one wins and the others get `409 IN_PROGRESS`. It works across serverless instances.',
  '',
  '## Insights',
  '',
  '- **The ">3 consecutive days" rule counts calendar days**, so Fri→Mon (only 2 working days) still needs a document and HOD approval. That matches the brief\'s wording, but HR may prefer working days. It is one constant to change.',
  '- **Managers\' long leave needs one approval**: their manager *is* the HOD (Admin), so a second step would only repeat itself.',
  '- **Leave that crosses the year end is charged to the starting year.** A real system would split it per year.',
  '- **The team-clash hint matters**: in a busy week (Diwali), approvers immediately see who else is already off.',
  '- **Access is hidden, not refused**: requests from another team return 404, so nobody can probe which IDs exist.',
  '- **Most traffic is short casual leave approved in one step.** The approval queue (cards + "needs HOD" tags) is the screen managers live in.',
];
writeFileSync(new URL('../../../docs/SIMULATION.md', import.meta.url), lines.join('\n') + '\n');
console.log(lines.slice(4).join('\n'));
await mongoose.disconnect();
await mongo.stop();
