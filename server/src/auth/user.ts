export type Role = 'EMPLOYEE' | 'MANAGER' | 'HOD';

/** The signed-in user, built from Clerk (identity) + publicMetadata (role and reporting line). */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
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
