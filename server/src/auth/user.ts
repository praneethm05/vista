export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN' | 'SYSADMIN';

/** The signed-in user: identity from Clerk, role and team from Vista's User collection. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  employeeCode: string;
  jobTitle: string;
  phone: string;
  location: string;
  managerId: string | null;
  hodId: string | null;
  avatarSeed: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}
