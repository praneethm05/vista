import { useState, type FormEvent } from 'react';
import { ApiError, useApi } from '../lib/api';
import { useMe } from '../lib/me';
import { Alert } from './ui';

const LOCATIONS = ['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi NCR', 'Chennai', 'Remote'];

/** First-run profile: who you are, so managers recognise the request they're accepting. */
export function ProfileStep() {
  const api = useApi();
  const { me, reload } = useMe();
  const [form, setForm] = useState({ name: me.name, jobTitle: me.jobTitle, phone: me.phone, location: me.location || 'Bengaluru' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await api('/me', { method: 'PATCH', body: JSON.stringify(form) });
      reload();
    } catch (err) {
      setErrors((err as ApiError).fields ?? {});
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <p className="eyebrow">Step 1 of 2</p>
        <h3 className="mt-1">Tell us about you</h3>
        <p className="text-small text-muted">Your manager sees this when you ask to join their team.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pn">Full name</label>
          <input id="pn" className="field" value={form.name} onChange={set('name')} autoComplete="name" />
          {errors.name && <p className="mt-1 text-small text-danger">{errors.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="pt">Job title</label>
          <input id="pt" className="field" placeholder="e.g. Software Engineer" value={form.jobTitle} onChange={set('jobTitle')} autoComplete="organization-title" />
          {errors.jobTitle && <p className="mt-1 text-small text-danger">{errors.jobTitle}</p>}
        </div>
        <div>
          <label className="label" htmlFor="pp">Mobile <span className="font-normal text-muted">(optional)</span></label>
          <input id="pp" className="field data" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
          {errors.phone && <p className="mt-1 text-small text-danger">{errors.phone}</p>}
        </div>
        <div>
          <label className="label" htmlFor="pl">Work location</label>
          <select id="pl" className="field" value={form.location} onChange={set('location')}>
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>
      {error && !Object.keys(errors).length && <Alert>{error}</Alert>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
    </form>
  );
}
