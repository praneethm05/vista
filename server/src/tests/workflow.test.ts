import { describe, expect, it } from 'vitest';
import { transition, type WorkflowRequest } from '../domain/workflow.js';
import { calendarDays, parseDay, workingDays } from '../domain/dates.js';

const base: WorkflowRequest = {
  employeeId: 'emp', managerId: 'mgr', hodId: 'hod', requiresHod: false, status: 'PENDING_MANAGER', stage: 'MANAGER',
};
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as { code: string }).code; }
  return 'NO_ERROR';
};

describe('workflow', () => {
  it('short leave: manager approval is final', () => {
    expect(transition(base, 'APPROVE', { id: 'mgr' }).status).toBe('APPROVED');
  });

  it('long leave: manager approval moves it to the HOD, HOD approval is final', () => {
    const long = { ...base, requiresHod: true };
    const afterManager = transition(long, 'APPROVE', { id: 'mgr' });
    expect(afterManager).toEqual({ status: 'PENDING_HOD', stage: 'HOD' });
    expect(transition({ ...long, ...afterManager }, 'APPROVE', { id: 'hod' }).status).toBe('APPROVED');
  });

  it('only the approver of the current stage may act', () => {
    expect(code(() => transition(base, 'APPROVE', { id: 'hod' }))).toBe('NOT_YOUR_APPROVAL');
    expect(code(() => transition({ ...base, status: 'PENDING_HOD', stage: 'HOD' }, 'APPROVE', { id: 'mgr' }))).toBe('NOT_YOUR_APPROVAL');
  });

  it('no self-approval', () => {
    expect(code(() => transition({ ...base, managerId: 'emp' }, 'APPROVE', { id: 'emp' }))).toBe('SELF_APPROVAL');
  });

  it('reject and request-info need a comment', () => {
    expect(code(() => transition(base, 'REJECT', { id: 'mgr' }))).toBe('COMMENT_REQUIRED');
    expect(code(() => transition(base, 'REQUEST_INFO', { id: 'mgr' }, '  '))).toBe('COMMENT_REQUIRED');
    expect(transition(base, 'REJECT', { id: 'mgr' }, 'Release week').status).toBe('REJECTED');
  });

  it('info request returns to the stage that asked', () => {
    const atHod = { ...base, requiresHod: true, status: 'PENDING_HOD' as const, stage: 'HOD' as const };
    const asked = transition(atHod, 'REQUEST_INFO', { id: 'hod' }, 'Need the doctor note');
    expect(asked.status).toBe('INFO_REQUESTED');
    expect(transition({ ...atHod, ...asked }, 'RESPOND', { id: 'emp' }).status).toBe('PENDING_HOD');
  });

  it('decided requests are final', () => {
    const approved = { ...base, status: 'APPROVED' as const };
    expect(code(() => transition(approved, 'REJECT', { id: 'mgr' }, 'x'))).toBe('NOT_PENDING');
    expect(code(() => transition(approved, 'CANCEL', { id: 'emp' }))).toBe('NOT_CANCELLABLE');
  });
});

describe('dates', () => {
  it('counts consecutive calendar days inclusively', () => {
    expect(calendarDays(parseDay('2026-11-01'), parseDay('2026-11-05'))).toBe(5);
    expect(calendarDays(parseDay('2026-11-09'), parseDay('2026-11-09'))).toBe(1);
  });
  it('counts working days without weekends', () => {
    // 6 Nov 2026 is a Friday → Fri..Mon = 2 working days
    expect(workingDays(parseDay('2026-11-06'), parseDay('2026-11-09'))).toBe(2);
  });
});
