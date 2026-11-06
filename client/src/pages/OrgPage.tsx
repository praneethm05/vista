import { useState } from 'react';
import { ApiError, useApi, useQuery } from '../lib/api';
import type { Person, Role } from '../lib/types';
import { Alert, Avatar, ErrorState, PageHeader, RoleTag, SkeletonList } from '../components/ui';
import { ROLE_LABEL } from '../components/Shell';

/** System admin: the whole reporting tree, and the controls to reshape it. */
export function OrgPage() {
  const api = useApi();
  const people = useQuery<Person[]>('/team/members');
  const [selected, setSelected] = useState<Person | null>(null);
  const [draft, setDraft] = useState<{ role: Role; managerId: string | null; department: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (people.loading && !people.data) return <SkeletonList rows={5} />;
  if (people.error) return <ErrorState message={people.error.message} onRetry={people.reload} />;
  const all = people.data!.filter((p) => p.role !== 'SYSADMIN');
  const reportsOf = (id: string) => all.filter((p) => p.managerId === id).sort((a, b) => a.name.localeCompare(b.name));
  const admins = all.filter((p) => p.role === 'ADMIN');
  const unassigned = all.filter((p) => p.role !== 'ADMIN' && (!p.managerId || !all.some((m) => m.id === p.managerId)));
  const managerOptions = all.filter((p) => (p.role === 'MANAGER' || p.role === 'ADMIN') && p.id !== selected?.id);

  function pick(p: Person) {
    setSelected(p);
    setDraft({ role: p.role, managerId: p.managerId, department: p.department });
    setNotice(null);
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    setNotice(null);
    try {
      await api(`/org/${selected.id}`, { method: 'PATCH', body: JSON.stringify(draft) });
      setNotice({ tone: 'success', text: `${selected.name} updated.` });
      people.reload();
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setSaving(false);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (p: Person) => !q || [p.name, p.email, p.department, p.employeeCode].some((v) => v?.toLowerCase().includes(q));
  const managers = all.filter((p) => p.role === 'MANAGER').sort((a, b) => a.department.localeCompare(b.department));

  const Row = ({ p, compact = false }: { p: Person; compact?: boolean }) => {
    const active = selected?.id === p.id;
    return (
      <button onClick={() => pick(p)} aria-pressed={active}
        className={`flex w-full items-center gap-2.5 rounded-control px-2 ${compact ? 'py-1.5' : 'py-2'} text-left transition ${active ? 'bg-brand-tint ring-1 ring-brand/30' : 'hover:bg-canvas'} ${q && matches(p) ? 'bg-accent-tint/60' : ''}`}>
        <Avatar seed={p.avatarSeed ?? p.email} size={compact ? 26 : 34} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${compact ? 'text-small' : 'font-semibold'}`}>{p.name}</span>
          {!compact && <span className="block truncate text-tiny text-muted"><RoleTag role={p.role} /> {p.department}</span>}
        </span>
        {compact && <span className="data text-[0.6875rem] text-muted">{p.employeeCode}</span>}
      </button>
    );
  };

  const TeamCard = ({ lead, members, title }: { lead?: Person; members: Person[]; title?: string }) => {
    const key = lead?.id ?? title ?? 'x';
    const visible = q ? members.filter(matches) : expanded[key] ? members : members.slice(0, 5);
    const hidden = members.length - visible.length;
    if (q && !visible.length && !(lead && matches(lead))) return null;
    return (
      <div className="card flex flex-col p-3">
        {lead ? <Row p={lead} /> : <p className="px-2 py-1 text-small font-semibold text-warning">{title}</p>}
        <div className="mt-1 border-t border-line pt-1">
          {members.length === 0 && <p className="px-2 py-2 text-tiny text-muted">No one in this team yet.</p>}
          {visible.map((m) => <Row key={m.id} p={m} compact />)}
          {!q && hidden > 0 && (
            <button className="mt-1 w-full rounded-control py-1.5 text-tiny font-semibold text-brand hover:bg-brand-tint" onClick={() => setExpanded({ ...expanded, [key]: true })}>Show all {members.length}</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader eyebrow="System admin" title="Organisation" />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input className="field max-w-sm" placeholder="Find a person, department or ID" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
            <span className="text-tiny text-muted">{all.length} people · {managers.length} teams · click anyone to edit</span>
          </div>
          {admins.map((a) => (
            <div key={a.id} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-56 flex-1"><Row p={a} /></div>
              <span className="pr-2 text-tiny text-muted">Second-level approver for {reportsOf(a.id).length} managers and their teams</span>
            </div>
          ))}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managers.map((m) => <TeamCard key={m.id} lead={m} members={reportsOf(m.id)} />)}
            {unassigned.length > 0 && <TeamCard title={`Not in a team yet (${unassigned.length})`} members={unassigned} />}
          </div>
        </section>

        <aside className="card h-fit space-y-5 p-5 sm:p-6 lg:sticky lg:top-24">
          {!selected || !draft ? (
            <p className="text-small text-muted">Select a person in the tree to change their role, team or department.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Avatar seed={selected.avatarSeed ?? selected.email} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{selected.name}</p>
                  <p className="truncate text-tiny text-muted">{selected.email} · <span className="data">{selected.employeeCode}</span></p>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="role">Role</label>
                <select id="role" className="field" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin · HOD</option>
                </select>
              </div>
              {draft.role !== 'ADMIN' && (
                <div>
                  <label className="label" htmlFor="mgr">Reports to</label>
                  <select id="mgr" className="field" value={draft.managerId ?? ''} onChange={(e) => setDraft({ ...draft, managerId: e.target.value || null })}>
                    <option value="">Nobody (not in a team)</option>
                    {managerOptions
                      .filter((m) => draft.role !== 'MANAGER' || m.role === 'ADMIN')
                      .map((m) => <option key={m.id} value={m.id}>{m.name} · {ROLE_LABEL[m.role]}</option>)}
                  </select>
                  {draft.role === 'MANAGER' && <p className="mt-1 text-tiny text-muted">Managers report to an admin (HOD).</p>}
                </div>
              )}
              <div>
                <label className="label" htmlFor="dept">Department</label>
                <input id="dept" className="field" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
              </div>
              {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
              <button className="btn-primary w-full" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
              <p className="text-tiny text-muted">Requests already in progress keep their approvers. New requests follow the new structure.</p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
