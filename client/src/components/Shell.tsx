import { NavLink, Outlet } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { useMe } from '../lib/me';
import { Avatar } from './ui';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? '#fff' : '#5c0fd9'} />
        <path d="M8 10l8 13 8-13" stroke="#ff6300" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`font-display text-[1.6rem] uppercase ${light ? 'text-white' : 'text-ink'}`}>Vista</span>
    </span>
  );
}

export const ROLE_LABEL = { EMPLOYEE: 'Employee', MANAGER: 'Manager', ADMIN: 'Admin · HOD', SYSADMIN: 'System admin' } as const;

export function navLinks(role: string, hasTeam: boolean) {
  if (role === 'SYSADMIN') return [{ to: '/dashboard', label: 'Dashboard' }, { to: '/org', label: 'Organisation' }, { to: '/settings', label: 'Settings' }, { to: '/audit', label: 'Audit log' }];
  if (role === 'ADMIN') return [{ to: '/dashboard', label: 'Dashboard' }, { to: '/approvals', label: 'Approvals' }, { to: '/people', label: 'People' }, { to: '/audit', label: 'Audit log' }];
  if (role === 'MANAGER') return [{ to: '/dashboard', label: 'Dashboard' }, { to: '/approvals', label: 'Approvals' }, { to: '/team', label: 'My team' }, { to: '/', label: 'My leave' }, { to: '/apply', label: 'Apply' }];
  if (!hasTeam) return [{ to: '/', label: 'Join a team' }];
  return [{ to: '/', label: 'My leave' }, { to: '/apply', label: 'Apply' }];
}

export function Shell() {
  const { me } = useMe();
  const { signOut } = useClerk();
  const links = navLinks(me.role, !!me.managerId);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-2 text-small font-semibold transition ${isActive ? 'bg-brand text-white' : 'text-muted hover:bg-brand-tint hover:text-brand'}`;

  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <NavLink to={links[0].to}><Logo /></NavLink>
          <nav className="hidden gap-1 sm:flex">
            {links.map((l) => <NavLink key={l.to} to={l.to} end className={linkClass}>{l.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-small font-semibold leading-tight">{me.name}</p>
              <p className="text-tiny text-muted">{ROLE_LABEL[me.role]} · <span className="data">{me.employeeCode}</span></p>
            </div>
            <Avatar seed={me.avatarSeed} />
            <button className="btn-ghost px-3 py-2" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface px-2 py-2 sm:hidden">
        {links.map((l) => <NavLink key={l.to} to={l.to} end className={linkClass}>{l.label}</NavLink>)}
      </nav>
    </div>
  );
}
