/**
 * Populates a realistic organisation for evaluators (idempotent: removes and recreates only seed_ data).
 * Demo logins (npm run seed) are woven in; real sign-ups are never touched.
 *   npm run seed:org
 * Seeded colleagues use @vista-demo.com addresses, so no email is ever sent to them.
 */
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { AuditLog } from '../models/AuditLog.js';
import { LeaveDocument } from '../models/Document.js';
import { addDays, calendarDays, formatDay, orgToday, workingDays } from '../domain/dates.js';

await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'vista' });

// Deterministic randomness so every run produces the same company.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

// ── Clean previous seed data ────────────────────────────────────────────────
const oldIds = (await User.find({ clerkId: /^seed_/ }).select('clerkId').lean()).map((u) => u.clerkId);
const demoUsers = await User.find({ email: /\+clerk_test@vista-demo\.com$/ }).lean();
const demo = Object.fromEntries(demoUsers.map((u) => [u.email.split('+')[0], u]));
if (!demo.admin || !demo.manager || !demo.employee) throw new Error('Run `npm run seed` first to create the demo logins.');
const demoIds = [demo.admin.clerkId, demo.manager.clerkId, demo.employee.clerkId];
const oldRequests = await LeaveRequest.find({ $or: [{ employeeId: { $in: [...oldIds, ...demoIds] } }] }).select('_id').lean();
await AuditLog.deleteMany({ $or: [{ requestId: { $in: oldRequests.map((r) => r._id) } }, { actorId: { $in: oldIds } }] });
await LeaveDocument.deleteMany({ ownerId: { $in: [...oldIds, ...demoIds] } });
await LeaveRequest.deleteMany({ _id: { $in: oldRequests.map((r) => r._id) } });
await User.deleteMany({ clerkId: /^seed_/ });

// ── People ──────────────────────────────────────────────────────────────────
const admin = demo.admin;
await User.updateOne({ clerkId: admin.clerkId }, { $set: { department: 'Leadership' } });
type P = { clerkId: string; name: string; email: string; role: 'EMPLOYEE' | 'MANAGER'; department: string; managerId: string; hodId: string };
const people: P[] = [];
let code = 10;
async function addPerson(name: string, role: P['role'], department: string, managerId: string) {
  const clerkId = `seed_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`;
  const p: P = { clerkId, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@vista-demo.com`, role, department, managerId, hodId: admin.clerkId };
  await User.create({ ...p, employeeCode: `VST-${String(code++).padStart(4, '0')}` });
  people.push(p);
  return p;
}
const meera = { clerkId: demo.manager.clerkId, name: demo.manager.name, email: demo.manager.email, role: 'MANAGER' as const, department: 'Engineering', managerId: admin.clerkId, hodId: admin.clerkId };
await User.updateOne({ clerkId: meera.clerkId }, { $set: { department: 'Engineering', managerId: admin.clerkId, hodId: admin.clerkId } });
await User.updateOne({ clerkId: demo.employee.clerkId }, { $set: { department: 'Engineering', managerId: meera.clerkId, hodId: admin.clerkId } });

const karan = await addPerson('Karan Shah', 'MANAGER', 'Operations', admin.clerkId);
const fatima = await addPerson('Fatima Khan', 'MANAGER', 'Customer Experience', admin.clerkId);
const rohit = await addPerson('Rohit Bhat', 'MANAGER', 'Product & Design', admin.clerkId);
const teams: [typeof meera | P, string[]][] = [
  [meera, ['Priya Nair', 'Rahul Gupta', 'Sneha Reddy', 'Vikram Das', 'Ananya Iyer']],
  [karan, ['Rohan Kulkarni', 'Divya Menon', 'Kabir Singh', 'Isha Patel']],
  [fatima, ['Nikhil Joshi', 'Pooja Hegde', 'Siddharth Rao', 'Tara D’Souza']],
  [rohit, ['Yash Agarwal', 'Zoya Mirza', 'Aman Verma']],
];
for (const [mgr, names] of teams) for (const n of names) await addPerson(n, 'EMPLOYEE', mgr.department, mgr.clerkId);
const nameOf = (id: string) => (id === meera.clerkId ? meera.name : id === admin.clerkId ? admin.name : people.find((p) => p.clerkId === id)?.name ?? '');
const roleOf = (id: string) => (id === admin.clerkId ? 'ADMIN' : id === meera.clerkId || people.some((p) => p.clerkId === id && p.role === 'MANAGER') ? 'MANAGER' : 'EMPLOYEE');

// ── Leave ───────────────────────────────────────────────────────────────────
const today = orgToday();
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 60 Td (Medical certificate - sample) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const REASONS: Record<string, string[]> = {
  ANNUAL: ['Family wedding in Mysuru', 'Trip to Coorg with family', 'Visiting parents in Kochi', 'Goa holiday', 'Sister’s engagement', 'Diwali at home in Jaipur'],
  SICK: ['Viral fever', 'Migraine', 'Dental surgery recovery', 'Food poisoning'],
  CASUAL: ['Passport appointment', 'House shifting', 'Bank work', 'Parent-teacher meeting', 'Car service and RTO visit'],
  BEREAVEMENT: ['Grandmother passed away'],
  PET: ['Adopted a puppy'],
};
const COMMENTS = { ok: ['Enjoy!', 'Approved, have a good break.', 'Take care, get well soon.', 'Approved. Please hand over to the team.', ''], no: ['Quarter-end close that week, can you move it by a week?', 'Release freeze, please pick other dates.', 'Two others are already off then.'] };

type Plan = { emp: { clerkId: string; name: string; email: string; managerId: string; department: string }; type: string; from: Date; to: Date; status: string; doc?: boolean; info?: string; reply?: string; daysAgo?: number };
const plans: Plan[] = [];
const workerPool = [...people.filter((p) => p.role === 'EMPLOYEE'), ...[karan, fatima, rohit]];
const weekday = (d: Date) => { while ([0, 6].includes(d.getUTCDay())) d = addDays(d, 1); return d; };

// History: Jan–Oct, 2–3 past leaves each
for (const p of workerPool) {
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const type = pick(['ANNUAL', 'ANNUAL', 'CASUAL', 'CASUAL', 'SICK', 'SICK']);
    const from = weekday(addDays(today, -Math.floor(20 + rand() * 280)));
    const len = type === 'ANNUAL' ? Math.floor(rand() * 3) : 0;
    const roll = rand();
    plans.push({ emp: p, type, from, to: addDays(from, len), status: roll < 0.8 ? 'APPROVED' : roll < 0.9 ? 'REJECTED' : 'CANCELLED' });
  }
}
// One long annual leave in the past for Priya (went through HOD)
plans.push({ emp: people.find((p) => p.name === 'Priya Nair')!, type: 'ANNUAL', from: weekday(addDays(today, -60)), to: addDays(weekday(addDays(today, -60)), 6), status: 'APPROVED', doc: true });
plans.push({ emp: people.find((p) => p.name === 'Pooja Hegde')!, type: 'BEREAVEMENT', from: weekday(addDays(today, -95)), to: addDays(weekday(addDays(today, -95)), 2), status: 'APPROVED' });
plans.push({ emp: people.find((p) => p.name === 'Yash Agarwal')!, type: 'PET', from: weekday(addDays(today, -40)), to: weekday(addDays(today, -40)), status: 'APPROVED' });
// On leave today
plans.push({ emp: people.find((p) => p.name === 'Rahul Gupta')!, type: 'SICK', from: addDays(today, -1), to: today, status: 'APPROVED', daysAgo: 1 });
plans.push({ emp: people.find((p) => p.name === 'Isha Patel')!, type: 'ANNUAL', from: addDays(today, -2), to: addDays(today, 3), status: 'APPROVED', doc: true, daysAgo: 12 });
// Upcoming approved (next week)
plans.push({ emp: people.find((p) => p.name === 'Nikhil Joshi')!, type: 'CASUAL', from: weekday(addDays(today, 4)), to: weekday(addDays(today, 4)), status: 'APPROVED', daysAgo: 3 });
plans.push({ emp: people.find((p) => p.name === 'Zoya Mirza')!, type: 'ANNUAL', from: weekday(addDays(today, 5)), to: addDays(weekday(addDays(today, 5)), 1), status: 'APPROVED', daysAgo: 5 });
// Waiting for Meera (demo manager)
plans.push({ emp: people.find((p) => p.name === 'Sneha Reddy')!, type: 'ANNUAL', from: weekday(addDays(today, 17)), to: addDays(weekday(addDays(today, 17)), 4), status: 'PENDING_MANAGER', doc: true, daysAgo: 1 });
plans.push({ emp: people.find((p) => p.name === 'Vikram Das')!, type: 'CASUAL', from: weekday(addDays(today, 6)), to: weekday(addDays(today, 6)), status: 'PENDING_MANAGER', daysAgo: 0 });
plans.push({ emp: people.find((p) => p.name === 'Ananya Iyer')!, type: 'SICK', from: weekday(addDays(today, 10)), to: weekday(addDays(today, 10)), status: 'PENDING_MANAGER', daysAgo: 0 });
// Info requested by Meera
plans.push({ emp: people.find((p) => p.name === 'Priya Nair')!, type: 'ANNUAL', from: weekday(addDays(today, 24)), to: addDays(weekday(addDays(today, 24)), 1), status: 'INFO_REQUESTED', info: 'Who is covering the sprint demo that Friday?', daysAgo: 2 });
// Waiting for Aditi (demo admin) at HOD stage
plans.push({ emp: people.find((p) => p.name === 'Kabir Singh')!, type: 'ANNUAL', from: weekday(addDays(today, 14)), to: addDays(weekday(addDays(today, 14)), 4), status: 'PENDING_HOD', doc: true, daysAgo: 2 });
plans.push({ emp: people.find((p) => p.name === 'Siddharth Rao')!, type: 'ANNUAL', from: weekday(addDays(today, 31)), to: addDays(weekday(addDays(today, 31)), 6), status: 'PENDING_HOD', doc: true, daysAgo: 3 });
// Other managers' queues
plans.push({ emp: people.find((p) => p.name === 'Divya Menon')!, type: 'CASUAL', from: weekday(addDays(today, 8)), to: weekday(addDays(today, 8)), status: 'PENDING_MANAGER', daysAgo: 1 });
plans.push({ emp: people.find((p) => p.name === 'Aman Verma')!, type: 'SICK', from: weekday(addDays(today, -3)), to: weekday(addDays(today, -3)), status: 'PENDING_MANAGER', daysAgo: 2 });
// Demo employee Arjun: light history only, future dates free
const arjun = { clerkId: demo.employee.clerkId, name: demo.employee.name, email: demo.employee.email, managerId: meera.clerkId, department: 'Engineering' };
plans.push({ emp: arjun, type: 'CASUAL', from: weekday(addDays(today, -45)), to: weekday(addDays(today, -45)), status: 'APPROVED' });
plans.push({ emp: arjun, type: 'SICK', from: weekday(addDays(today, -120)), to: weekday(addDays(today, -120)), status: 'APPROVED' });

let made = 0;
const audits: Record<string, unknown>[] = [];
for (const p of plans) {
  const mgrId = p.emp.managerId;
  const isManager = mgrId === admin.clerkId;
  const cal = calendarDays(p.from, p.to);
  const work = workingDays(p.from, p.to);
  if (!work) continue;
  const longLeave = cal > 3;
  const requiresHod = longLeave && !isManager;
  const submittedAt = new Date(Math.min(addDays(p.from, -(3 + Math.floor(rand() * 10))).getTime(), addDays(today, -(p.daysAgo ?? 0)).getTime()) + 10 * 3600_000 + Math.floor(rand() * 6) * 3600_000);
  const reason = pick(REASONS[p.type] ?? ['Personal']);
  const _id = new mongoose.Types.ObjectId();
  const docIds: mongoose.Types.ObjectId[] = [];
  if (p.doc || longLeave) {
    const d = await LeaveDocument.create({ ownerId: p.emp.clerkId, requestId: _id, filename: p.type === 'SICK' ? 'medical-certificate.pdf' : 'travel-itinerary.pdf', mimeType: 'application/pdf', size: pdf.length, data: pdf });
    docIds.push(d._id);
  }
  const stage = p.status === 'PENDING_HOD' || (p.status === 'APPROVED' && requiresHod) ? 'HOD' : 'MANAGER';
  let t = submittedAt.getTime();
  const step = () => (t += (1 + Math.floor(rand() * 20)) * 3600_000);
  const log = (actorId: string, action: string, from: string | null, to: string | null, comment = '') =>
    audits.push({ requestId: _id, actorId, actorName: nameOf(actorId) || p.emp.name, actorRole: actorId === p.emp.clerkId ? (isManager ? 'MANAGER' : 'EMPLOYEE') : roleOf(actorId), action, fromStatus: from, toStatus: to, comment, meta: {}, at: new Date(t) });
  log(p.emp.clerkId, 'SUBMITTED', null, 'PENDING_MANAGER', reason);
  let lastComment = '';
  if (p.status === 'INFO_REQUESTED') { step(); log(mgrId, 'INFO_REQUESTED', 'PENDING_MANAGER', 'INFO_REQUESTED', p.info); lastComment = p.info ?? ''; }
  if (['APPROVED', 'PENDING_HOD', 'REJECTED', 'CANCELLED'].includes(p.status)) {
    if (p.status === 'REJECTED') { step(); lastComment = pick(COMMENTS.no); log(mgrId, 'REJECTED', 'PENDING_MANAGER', 'REJECTED', lastComment); }
    else if (p.status === 'CANCELLED') { step(); log(p.emp.clerkId, 'CANCELLED', 'PENDING_MANAGER', 'CANCELLED'); }
    else if (requiresHod) {
      step(); log(mgrId, 'APPROVED_BY_MANAGER', 'PENDING_MANAGER', 'PENDING_HOD', 'Fine from my side.');
      if (p.status === 'APPROVED') { step(); lastComment = pick(COMMENTS.ok); log(admin.clerkId, 'APPROVED', 'PENDING_HOD', 'APPROVED', lastComment); }
    } else { step(); lastComment = pick(COMMENTS.ok); log(mgrId, 'APPROVED', 'PENDING_MANAGER', 'APPROVED', lastComment); }
  }
  await LeaveRequest.collection.insertOne({
    _id, employeeId: p.emp.clerkId, employeeName: p.emp.name, employeeEmail: p.emp.email, department: p.emp.department,
    managerId: mgrId, hodId: admin.clerkId, leaveType: p.type, fromDate: p.from, toDate: p.to, calendarDays: cal, workingDays: work,
    reason, documentIds: docIds, requiresHod, status: p.status, stage, lastComment, version: 1,
    createdAt: submittedAt, updatedAt: new Date(t),
  });
  made++;
}
await AuditLog.insertMany(audits);

const counts = await LeaveRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
console.log(`✓ Organisation ready: ${people.length + 3} people (+ sysadmin), ${made} leave requests, ${audits.length} audit entries`);
console.log('  ' + counts.map((c) => `${c._id} ${c.n}`).join(' · '));
await mongoose.disconnect();
