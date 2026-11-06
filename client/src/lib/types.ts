export type Role = 'EMPLOYEE' | 'MANAGER' | 'HOD';
export type Status = 'PENDING_MANAGER' | 'PENDING_HOD' | 'INFO_REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Balance { code: string; label: string; quota: number | null; used: number; pending: number; available: number | null }
export interface Me { id: string; name: string; email: string; role: Role; department: string; managerId: string | null; hodId: string | null; avatarSeed: string; balances: Balance[] }
export interface LeaveType { code: string; label: string; description: string; quota: number | null; documentAlways: boolean; backdateDays: number }

export interface LeaveRequest {
  _id: string; employeeId: string; employeeName: string; employeeEmail: string; department: string; managerId: string; hodId: string;
  leaveType: string; fromDate: string; toDate: string; calendarDays: number; workingDays: number;
  reason: string; documentIds: string[]; requiresHod: boolean; status: Status; stage: 'MANAGER' | 'HOD';
  lastComment: string; createdAt: string; updatedAt: string;
  insights?: { balance: Balance | null; balanceAfterApproval: number | null; teamClashes: { _id: string; employeeName: string; fromDate: string; toDate: string; status: Status }[] };
}
export interface AuditEntry { _id: string; requestId?: string; actorName: string; actorRole: Role; action: string; fromStatus: Status | null; toStatus: Status | null; comment: string; at: string }
export interface DocMeta { _id: string; filename: string; mimeType: string; size: number }
export interface Detail { request: LeaveRequest; timeline: AuditEntry[]; documents: DocMeta[] }
