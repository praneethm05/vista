/** Property-based tests: rules that must hold for ANY input, checked on hundreds of random cases. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, calendarDays, formatDay, orgToday, parseDay, workingDays } from '../domain/dates.js';
import { transition, type Action, type Status, type WorkflowRequest } from '../domain/workflow.js';

const day = fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }).map((d) => parseDay(formatDay(d)));

describe('date properties', () => {
  it('working days never exceed calendar days, and a full week has exactly 5', () => {
    fc.assert(fc.property(day, fc.integer({ min: 0, max: 400 }), (from, len) => {
      const to = addDays(from, len);
      const cal = calendarDays(from, to);
      const work = workingDays(from, to);
      expect(cal).toBe(len + 1);
      expect(work).toBeLessThanOrEqual(cal);
      expect(workingDays(from, addDays(from, 6))).toBe(5);
    }), { numRuns: 500 });
  });

  it('org "today" is always the UTC date or the next day (IST is ahead of UTC)', () => {
    fc.assert(fc.property(fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }), (now) => {
      const diff = calendarDays(parseDay(now.toISOString().slice(0, 10)), orgToday(now)) - 1;
      expect([0, 1]).toContain(diff);
    }), { numRuns: 500 });
  });
});

describe('workflow properties', () => {
  const actors = ['emp', 'mgr', 'hod', 'stranger'];
  const actions: Action[] = ['APPROVE', 'REJECT', 'REQUEST_INFO', 'RESPOND', 'CANCEL'];

  it('for any sequence of actions by anyone: decisions are final, and APPROVED long leave always passed both approvers', () => {
    fc.assert(fc.property(
      fc.boolean(),
      fc.array(fc.record({ actor: fc.constantFrom(...actors), action: fc.constantFrom(...actions), comment: fc.constantFrom('', 'ok') }), { maxLength: 12 }),
      (requiresHod, steps) => {
        let req: WorkflowRequest = { employeeId: 'emp', managerId: 'mgr', hodId: 'hod', requiresHod, status: 'PENDING_MANAGER', stage: 'MANAGER' };
        const approvedBy = new Set<string>();
        for (const s of steps) {
          const before: Status = req.status;
          try {
            const next = transition(req, s.action, { id: s.actor }, s.comment);
            if (s.action === 'APPROVE') approvedBy.add(s.actor);
            req = { ...req, ...next };
          } catch {
            continue; // refused transitions leave the request unchanged
          }
          expect(['REJECTED', 'CANCELLED']).not.toContain(before); // nothing ever leaves a final state
          if (req.status === 'APPROVED' && requiresHod) expect(approvedBy).toEqual(new Set(['mgr', 'hod']));
          if (req.status === 'APPROVED') expect(approvedBy.has('emp')).toBe(false); // never self-approved
        }
      },
    ), { numRuns: 2000 });
  });
});
