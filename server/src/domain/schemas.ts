import { z } from 'zod';
import { LEAVE_TYPE_CODES } from './leaveTypes.js';
import { APPROVER_ACTIONS } from './workflow.js';

const day = z
  .string({ error: 'Please pick a date.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'That date does not exist.');

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid document id.');

export const createLeaveSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPE_CODES, { error: 'Please choose a leave type.' }),
    fromDate: day,
    toDate: day,
    reason: z
      .string({ error: 'Please tell us the reason.' })
      .trim()
      .min(3, 'Please add a short reason (at least 3 characters).')
      .max(500, 'Keep the reason under 500 characters.'),
    documentIds: z.array(objectId).max(5, 'You can attach up to 5 documents.').default([]),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    path: ['toDate'],
    message: 'The end date must be on or after the start date.',
  });

export const actionSchema = z.object({
  action: z.enum(APPROVER_ACTIONS, { error: 'Choose approve, reject or request info.' }),
  comment: z.string().trim().max(500, 'Keep the comment under 500 characters.').optional().default(''),
});

export const respondSchema = z.object({
  comment: z.string().trim().min(3, 'Please add a short reply.').max(500),
  documentIds: z.array(objectId).max(5).default([]),
});

export const listQuerySchema = z.object({
  status: z.string().optional(),
});

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type ActionInput = z.infer<typeof actionSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
