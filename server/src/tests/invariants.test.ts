/**
 * Invariants found in the senior review. Each test was written to fail first, then fixed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../createApp.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { Settings } from '../models/Settings.js';
import { addDays, formatDay, orgToday } from '../domain/dates.js';

process.env.NODE_ENV = 'test';
const app = createApp({ connect: false });
let mongo: MongoMemoryServer;
const u = (id: string, role: string, managerId: string | null, hodId: string | null) =>
  ({ id, name: id.toUpperCase(), email: `${id}@x.com`, role, department: 'Eng', employeeCode: `VST-${id}`, jobTitle: '', phone: '', location: '', managerId, hodId, avatarSeed: id });
const people = {
  emp: u('emp', 'EMPLOYEE', 'mgr', 'hod'),
  mgr: u('mgr', 'MANAGER', 'hod', 'hod'),
  mgr2: u('mgr2', 'MANAGER', 'hod', 'hod'),
  hod: u('hod', 'ADMIN', null, null),
  sys: u('sys', 'SYSADMIN', null, null),
};
const as = (k: keyof typeof people) => ({ 'x-test-user': JSON.stringify(people[k]) });
let monday = addDays(orgToday(), 7);
while (monday.getUTCDay() !== 1) monday = addDays(monday, 1);
const d = (n: number) => formatDay(addDays(monday, n));

beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  for (const p of Object.values(people)) {
    await User.create({ clerkId: p.id, name: p.name, email: p.email, role: p.role as 'EMPLOYEE', employeeCode: p.employeeCode, department: 'Eng', managerId: p.managerId, hodId: p.hodId });
  }
});

describe('invariants', () => {
  it('rejects a file whose bytes are not really a PDF/PNG/JPG, even if the browser says application/pdf', async () => {
    const res = await request(app).post('/api/documents').set(as('emp'))
      .attach('file', Buffer.from('MZ\x90\x00 this is an exe'), { filename: 'invoice.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(415);
  });

  it("'today' follows India time: 01:30 IST on 7 Nov is 7 Nov, even though UTC is still 6 Nov", () => {
    expect(formatDay(orgToday(new Date('2026-11-06T20:00:00Z')))).toBe('2026-11-07');
  });

  it('records who viewed a supporting document (sensitive personal data)', async () => {
    const up = await request(app).post('/api/documents').set(as('emp')).attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'med.pdf', contentType: 'application/pdf' });
    await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'SICK', fromDate: d(0), toDate: d(0), reason: 'Fever', documentIds: [up.body.id] });
    expect((await request(app).get(`/api/documents/${up.body.id}`).set(as('mgr'))).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'DOCUMENT_VIEWED', actorId: 'mgr' })).toBe(1);
  });

  it('moving an employee to a new manager moves their requests waiting at the manager stage (no orphans)', async () => {
    const r = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: d(1), toDate: d(1), reason: 'Bank' });
    expect((await request(app).patch('/api/org/emp').set(as('sys')).send({ managerId: 'mgr2' })).status).toBe(200);
    expect((await LeaveRequest.findById(r.body._id).lean())?.managerId).toBe('mgr2');
  });

  it('concurrent approvals never push a balance below zero, even after the quota is lowered', async () => {
    const a = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: d(0), toDate: d(2), reason: 'Trip A' });
    const b = await request(app).post('/api/leaves').set(as('emp')).send({ leaveType: 'CASUAL', fromDate: d(7), toDate: d(9), reason: 'Trip B' });
    expect([a.status, b.status]).toEqual([201, 201]); // 3 + 3 = full 6-day quota, reserved at submit
    await Settings.create({ _id: 'org', quotas: { CASUAL: 4 } }); // HR lowers the quota afterwards
    await new Promise((r) => setTimeout(r, 16_000)); // let the 15 s policy cache expire
    const [ra, rb] = await Promise.all([
      request(app).post(`/api/approvals/${a.body._id}/actions`).set(as('mgr')).send({ action: 'APPROVE' }),
      request(app).post(`/api/approvals/${b.body._id}/actions`).set(as('mgr')).send({ action: 'APPROVE' }),
    ]);
    const approvedDays = (await LeaveRequest.find({ employeeId: 'emp', status: 'APPROVED' }).lean()).reduce((n, x) => n + x.workingDays, 0);
    expect(approvedDays).toBeLessThanOrEqual(4);
    expect([ra.status, rb.status].filter((s) => s === 200).length).toBeLessThanOrEqual(1);
  }, 30_000);
});
