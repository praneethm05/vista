/**
 * Leave policy as data (Open/Closed): adding a leave type = adding a row, no code changes.
 * Inspired by Meesho's people-first policies (gender-neutral parental, wellness, pet adoption).
 */
export type LeaveTypeCode =
  | 'ANNUAL' | 'SICK' | 'CASUAL' | 'WELLNESS' | 'PARENTAL' | 'BEREAVEMENT' | 'PET';

export interface LeaveType {
  code: LeaveTypeCode;
  label: string;
  description: string;
  /** Working days per calendar year; null = no cap. */
  quota: number | null;
  /** Document needed even for short leave. */
  documentAlways: boolean;
  /** How many days back a request may start (sick leave is often applied after the fact). */
  backdateDays: number;
}

export const LEAVE_TYPES: readonly LeaveType[] = [
  { code: 'ANNUAL', label: 'Earned leave', description: 'Planned time off, holidays and travel.', quota: 18, documentAlways: false, backdateDays: 0 },
  { code: 'SICK', label: 'Sick leave', description: 'When you are unwell. Can be applied up to 7 days after.', quota: 12, documentAlways: false, backdateDays: 7 },
  { code: 'CASUAL', label: 'Casual leave', description: 'Short personal errands and emergencies.', quota: 6, documentAlways: false, backdateDays: 0 },
  { code: 'WELLNESS', label: 'Wellness leave', description: 'Critical illness needing ongoing care. Medical proof required.', quota: null, documentAlways: true, backdateDays: 7 },
  { code: 'PARENTAL', label: 'Parental leave', description: 'Gender-neutral, for birth, adoption or surrogacy.', quota: 150, documentAlways: true, backdateDays: 0 },
  { code: 'BEREAVEMENT', label: 'Bereavement leave', description: 'Time to grieve the loss of someone close.', quota: 5, documentAlways: false, backdateDays: 3 },
  { code: 'PET', label: 'Pet adoption leave', description: 'Settle in your new family member.', quota: 2, documentAlways: false, backdateDays: 0 },
];

export const LEAVE_TYPE_CODES = LEAVE_TYPES.map((t) => t.code) as [LeaveTypeCode, ...LeaveTypeCode[]];

export function getLeaveType(code: LeaveTypeCode): LeaveType {
  const type = LEAVE_TYPES.find((t) => t.code === code);
  if (!type) throw new Error(`Unknown leave type ${code}`);
  return type;
}

/** The assignment's strict rule: more than 3 consecutive days → documents + Manager AND HOD approval. */
export const LONG_LEAVE_THRESHOLD_DAYS = 3;

export function isLongLeave(calendarDayCount: number): boolean {
  return calendarDayCount > LONG_LEAVE_THRESHOLD_DAYS;
}

export function needsDocument(type: LeaveType, calendarDayCount: number): boolean {
  return type.documentAlways || isLongLeave(calendarDayCount);
}
