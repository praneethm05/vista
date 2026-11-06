import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../createApp.js';
import { User } from '../models/User.js';
import { addDays, formatDay, todayUtc } from '../domain/dates.js';

process.env.NODE_ENV = 'test';
const app = createApp({ connect: false });
let mongo: MongoMemoryServer;

const users = {
  emp: { id: 'emp', name: 'Asha Rao', email: 'asha@x.com', role: 'EMPLOYEE', department: 'Eng', managerId: 'mgr', hodId: 'hod', employeeCode: 'VST-1', jobTitle: '', phone: '', location: '', avatarSeed: 'asha' },
  emp2: { id: 'emp2', name: 'Ravi K', email: 'ravi@x.com', role: 'EMPLOYEE', department: 'Eng', managerId: 'mgr', hodId: 'hod', employeeCode: 'VST-1', jobTitle: '', phone: '', location: '', avatarSeed: 'ravi' },
  mgr: { id: 'mgr', name: 'Meera M', email: 'meera@x.com', role: 'MANAGER', department: 'Eng', managerId: null, hodId: 'hod', employeeCode: 'VST-1', jobTitle: '', phone: '', location: '', avatarSeed: 'meera' },
  hod: { id: 'hod', name: 'Harish H', email: 'harish@x.com', role: 'ADMIN', department: 'Eng', managerId: null, hodId: null, employeeCode: 'VST-1', jobTitle: '', phone: '', location: '', avatarSeed: 'harish' },
};
const as = (u: keyof typeof users) => ({ 'x-test-user': JSON.stringify(users[u]) });
// Start on the next Monday so working-day maths is predictable.
const monday = (() => { let d = addDays(todayUtc(), 7); while (d.getUTCDay() !== 1) d = addDays(d, 1); return d; })();
const day = (offset: number) => formatDay(addDays(monday, offset));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
});

async function uploadDoc(user: keyof typeof users) {
  const res = await request(app).post('/api/documents').set(as(user))
    .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'note.pdf', contentType: 'application/pdf' });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('leave API', () => {
  it('rejects unauthenticated calls with 401', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('validates input with friendly field errors', async () => {
    const res = await request(app).post('/api/leaves').set(as('emp'))
      .send({ leaveType: 'ANNUAL', fromDate: day(3), toDate: day(1), reason: 'Trip' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.toDate).toMatch(/on or after/);
  });

  it('requires a document for more than 3 consecutive days', async () => {
    const res = await request(app).post('/api/leaves').set(as('emp'))
      .send({ leaveType: 'ANNUAL', fromDate: day(0), toDate: day(3), reason: 'Family trip' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DOCUMENT_REQUIRED');
  });

  it('long leave goes Manager → HOD, with info request round-trip and full audit trail', async () => {
    const docId = await uploadDoc('emp');
    const created = await request(app).post('/api/leaves').set(as('emp'))
      .send({ leaveType: 'ANNUAL', fromDate: day(0), toDate: day(4), reason: 'Family wedding', documentIds: [docId] });
    expect(created.status).toBe(201);
    expect(created.body.requiresHod).toBe(true);
    const id = created.body._id;

    expect((await request(app).post(`/api/approvals/${id}/actions`).set(as('mgr')).send({ action: 'APPROVE' })).body.status).toBe('PENDING_HOD');
    expect((await request(app).post(`/api/approvals/${id}/actions`).set(as('hod')).send({ action: 'REQUEST_INFO', comment: 'Who covers on-call?' })).body.status).toBe('INFO_REQUESTED');
    expect((await request(app).post(`/api/leaves/${id}/respond`).set(as('emp')).send({ comment: 'Ravi covers on-call' })).body.status).toBe('PENDING_HOD');
    expect((await request(app).post(`/api/approvals/${id}/actions`).set(as('hod')).send({ action: 'APPROVE', comment: 'Enjoy' })).body.status).toBe('APPROVED');

    const detail = await request(app).get(`/api/leaves/${id}`).set(as('emp'));
    expect(detail.body.timeline.map((t: { action: string }) => t.action)).toEqual([
      'SUBMITTED', 'APPROVED_BY_MANAGER', 'INFO_REQUESTED', 'INFO_PROVIDED', 'APPROVED',
    ]);
    // The manager (approver) can open the document.
    expect((await request(app).get(`/api/documents/${docId}`).set(as('mgr'))).status).toBe(200);

    const me = await request(app).get('/api/me').set(as('emp'));
    expect(me.body.balances.find((b: { code: string }) => b.code === 'ANNUAL')).toMatchObject({ used: 5, available: 13 });
  });

  it('blocks overlapping requests with 409', async () => {
    await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: day(1), toDate: day(1), reason: 'Bank work' });
    const res = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'SICK', fromDate: day(0), toDate: day(2), reason: 'Fever' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVERLAP');
  });

  it('only one of two concurrent decisions wins (optimistic locking)', async () => {
    const created = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: day(0), toDate: day(0), reason: 'Errand' });
    const id = created.body._id;
    const [a, b] = await Promise.all([
      request(app).post(`/api/approvals/${id}/actions`).set(as('mgr')).send({ action: 'APPROVE' }),
      request(app).post(`/api/approvals/${id}/actions`).set(as('mgr')).send({ action: 'REJECT', comment: 'No' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("hides other employees' requests and documents (404, not 403)", async () => {
    const docId = await uploadDoc('emp');
    const created = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: day(0), toDate: day(0), reason: 'Errand' });
    expect((await request(app).get(`/api/leaves/${created.body._id}`).set(as('emp2'))).status).toBe(404);
    expect((await request(app).get(`/api/documents/${docId}`).set(as('emp2'))).status).toBe(404);
  });

  it('employees cannot use approver routes', async () => {
    expect((await request(app).get('/api/approvals').set(as('emp'))).status).toBe(403);
  });

  it('enforces the leave balance', async () => {
    const res = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'PET', fromDate: day(0), toDate: day(2), reason: 'New puppy' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('new employee asks to join a team; manager accepts once (second click 409)', async () => {
    await User.create({ clerkId: 'mgr', name: 'Meera M', email: 'meera@x.com', role: 'MANAGER', employeeCode: 'VST-0002', hodId: 'hod', department: 'Eng' });
    await User.create({ clerkId: 'new', name: 'Neha N', email: 'neha@x.com', role: 'EMPLOYEE', employeeCode: 'VST-0009' });
    const newbie = { 'x-test-user': JSON.stringify({ id: 'new', name: 'Neha N', email: 'neha@x.com', role: 'EMPLOYEE', department: 'Unassigned', employeeCode: 'VST-0009', jobTitle: '', phone: '', location: '', managerId: null, hodId: null, avatarSeed: 'neha' }) };

    const blocked = await request(app).post('/api/leaves').set(newbie).send({ leaveType: 'CASUAL', fromDate: day(0), toDate: day(0), reason: 'Errand' });
    expect(blocked.body.error.code).toBe('NO_TEAM');

    const found = await request(app).get('/api/team/managers?q=VST-0002').set(newbie);
    expect(found.body.map((m: { id: string }) => m.id)).toEqual(['mgr']);
    const asked = await request(app).post('/api/team/join-request').set(newbie).send({ managerId: 'mgr', message: 'New in Payments' });
    expect(asked.status).toBe(201);

    const inbox = await request(app).get('/api/team/requests').set(as('mgr'));
    expect(inbox.body).toHaveLength(1);
    const id = inbox.body[0]._id;
    expect((await request(app).post(`/api/team/requests/${id}/decision`).set(as('mgr')).send({ decision: 'ACCEPT' })).status).toBe(200);
    expect((await request(app).post(`/api/team/requests/${id}/decision`).set(as('mgr')).send({ decision: 'REJECT' })).status).toBe(409);
    expect(await User.findOne({ clerkId: 'new' }).lean()).toMatchObject({ managerId: 'mgr', hodId: 'hod' });
  });

  it('profile: validates phone and saves name, title and location', async () => {
    await User.create({ clerkId: 'emp', name: 'asha', email: 'asha@x.com', role: 'EMPLOYEE', employeeCode: 'VST-0100' });
    const bad = await request(app).patch('/api/me').set(as('emp')).send({ name: 'Asha Rao', jobTitle: 'Engineer', phone: '12345', location: 'Bengaluru' });
    expect(bad.status).toBe(400);
    const ok = await request(app).patch('/api/me').set(as('emp')).send({ name: 'Asha Rao', jobTitle: 'Software Engineer', phone: '+91 98765 43210', location: 'Bengaluru' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Asha Rao', jobTitle: 'Software Engineer', location: 'Bengaluru' });
  });
});
