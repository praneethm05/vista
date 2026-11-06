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

  const Node = ({ p, depth }: { p: Person; depth: number }) => {
    const kids = reportsOf(p.id);
    const active = selected?.id === p.id;
    return (
      <li>
        <button onClick={() => pick(p)} aria-pressed={active}
          className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition ${active ? 'bg-brand-tint ring-1 ring-brand/30' : 'hover:bg-canvas'}`}>
          <Avatar seed={p.avatarSeed ?? p.email} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small font-semibold">{p.name}</span>
            <span className="block truncate text-tiny text-muted"><RoleTag role={p.role} /> {p.department}</span>
          </span>
          {kids.length > 0 && <span className="data rounded-md bg-line/70 px-1.5 text-tiny text-muted">{kids.length}</span>}
        </button>
        {kids.length > 0 && (
          <ul className={`ml-5 space-y-1 border-l border-line pl-3 ${depth === 0 ? 'mt-1' : ''}`}>
            {kids.map((k) => <Node key={k.id} p={k} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader eyebrow="System admin" title="Organisation" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-4 sm:p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h3>Reporting tree</h3>
            <span className="text-tiny text-muted">{all.length} people · click someone to edit</span>
          </div>
          <ul className="space-y-1">{admins.map((a) => <Node key={a.id} p={a} depth={0} />)}</ul>
          {unassigned.length > 0 && (
            <div className="mt-6 rounded-card border border-warning/30 bg-warning-tint/40 p-3">
              <p className="mb-2 text-small font-semibold text-warning">Not in a team yet ({unassigned.length})</p>
              <ul className="space-y-1">{unassigned.map((p) => <Node key={p.id} p={p} depth={1} />)}</ul>
            </div>
          )}
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
