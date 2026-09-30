import { useQuery } from '@tanstack/react-query';
import { Archive, Globe, Pencil, Plus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, MoneyInput, PageHeader, Textarea, Toggle } from '../../components/ui';
import { useYear } from '../../context/YearContext';
import { api, fieldErrors } from '../../lib/api';
import { fmtDate, inr } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import type { EventYear } from '../../lib/types';

export default function EventsAdmin() {
  const { years, loading, setYear } = useYear();
  const [editing, setEditing] = useState<EventYear | 'new' | null>(null);
  const [roster, setRoster] = useState<EventYear | null>(null);
  const [archiving, setArchiving] = useState<EventYear | null>(null);

  return (
    <>
      <PageHeader title="Events / Years" subtitle="Each year keeps its own money, sarees, photos and videos." actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New event year</Button>} />
      {loading ? <Loading /> : years.length === 0 ? (
        <div className="card"><EmptyState title="No event years yet" action={<Button onClick={() => setEditing('new')}>Create the first year</Button>} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {years.map((e) => (
            <Card key={e.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-3xl font-semibold text-brand-800">{e.year}</p>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted">{[e.location, e.start_date && `${fmtDate(e.start_date)}${e.end_date ? ` to ${fmtDate(e.end_date)}` : ''}`].filter(Boolean).join(' · ') || 'No dates set'}</p>
                </div>
                {e.is_published ? <Badge tone="green"><Globe className="size-3" /> Public</Badge> : <Badge>Hidden from public</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {e.public_finance && <Badge tone="blue">Finance summary public</Badge>}
                {e.public_contributor_names && <Badge tone="blue">Contributor names public</Badge>}
                {e.public_expense_list && <Badge tone="blue">Expense list public</Badge>}
                {e.public_saree_sales && <Badge tone="blue">Saree sales public</Badge>}
              </div>
              <p className="mt-3 text-sm text-muted">Default contribution: <span className="money font-medium text-ink">{inr(e.default_expected_contribution)}</span></p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(e)}>Edit & visibility</Button>
                <Button size="sm" variant="secondary" icon={<Users className="size-3.5" />} onClick={() => setRoster(e)}>Contribution list</Button>
                <Button size="sm" variant="ghost" onClick={() => setYear(e.year)}>Switch to {e.year}</Button>
                <Button size="sm" variant="ghost" className="ml-auto text-red-600" icon={<Archive className="size-3.5" />} onClick={() => setArchiving(e)}>Archive</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={(y) => setYear(y)} />}
      {roster && <RosterEditor event={roster} onClose={() => setRoster(null)} />}
      {archiving && <ArchiveDialog event={archiving} onClose={() => setArchiving(null)} />}
    </>
  );
}

function EventForm({ event, onClose, onCreated }: { event: EventYear | null; onClose: () => void; onCreated: (y: number) => void }) {
  const nextYear = new Date().getFullYear();
  const [form, setForm] = useState({
    year: String(event?.year ?? nextYear),
    title: event?.title ?? `Durgamatha Utsav ${nextYear}`,
    description: event?.description ?? '',
    location: event?.location ?? '',
    startDate: event?.start_date ?? '',
    endDate: event?.end_date ?? '',
    defaultExpectedContribution: String(event?.default_expected_contribution ?? 5000),
    budget: '',
    isPublished: event?.is_published ?? false,
    publicFinance: event?.public_finance ?? true,
    publicContributorNames: event?.public_contributor_names ?? false,
    publicExpenseList: event?.public_expense_list ?? false,
    publicSareeSales: event?.public_saree_sales ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useSave(
    () => {
      const { year, budget, ...rest } = form;
      return event ? api.put(`/events/${event.year}`, rest) : api.post('/events', { ...rest, year, budget: budget || 0 });
    },
    { success: event ? 'Event saved' : 'Event year created', onSuccess: () => { if (!event) onCreated(Number(form.year)); onClose(); } },
  );
  return (
    <Modal open onClose={onClose} size="lg" title={event ? `Edit ${event.year}` : 'New event year'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="event-form" loading={save.isPending}>Save</Button></>}>
      <form id="event-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); setErrors({}); save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) }); }}>
        {!event && <Field label="Year" required error={errors.year}><Input type="number" inputMode="numeric" value={form.year} onChange={(e) => set('year', e.target.value)} min={2000} max={2100} required /></Field>}
        <Field label="Title" required error={errors.title} className={event ? 'sm:col-span-2' : ''}><Input value={form.title} onChange={(e) => set('title', e.target.value)} required /></Field>
        <Field label="Location" className="sm:col-span-2"><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Start date" error={errors.startDate}><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End date" error={errors.endDate}><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Description" hint="Shown on the public year page." className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} /></Field>
        <Field label="Expected contribution per member" hint={event ? 'Used for members added later. Edit individual amounts in the contribution list.' : 'Every active member is added with this amount.'}>
          <MoneyInput value={form.defaultExpectedContribution} onChange={(e) => set('defaultExpectedContribution', e.target.value)} />
        </Field>
        {!event && <Field label="Planned budget"><MoneyInput value={form.budget} onChange={(e) => set('budget', e.target.value)} placeholder="100000" /></Field>}
        <div className="sm:col-span-2">
          <p className="label">Public transparency for this year</p>
          <div className="divide-y divide-line rounded-xl border border-line px-3">
            <Toggle label="Show this year on the public website" description="Photos, videos and summaries below appear only when this is on." checked={form.isPublished} onChange={(v) => set('isPublished', v)} />
            <Toggle label="Public financial summary" description="Totals, balance and spending by category." checked={form.publicFinance} onChange={(v) => set('publicFinance', v)} disabled={!form.isPublished} />
            <Toggle label="Show contributor names and amounts" description="Otherwise only counts (paid / pending) are shown." checked={form.publicContributorNames} onChange={(v) => set('publicContributorNames', v)} disabled={!form.isPublished} />
            <Toggle label="Show itemised expenses" description="Date, category, reason and amount. Proofs and bills are never public." checked={form.publicExpenseList} onChange={(v) => set('publicExpenseList', v)} disabled={!form.isPublished} />
            <Toggle label="Show individual saree sales" description="Otherwise only purchased / sold / remaining totals." checked={form.publicSareeSales} onChange={(v) => set('publicSareeSales', v)} disabled={!form.isPublished} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

interface RosterRow { user_id: number; name: string; is_active: boolean; expected_amount: number | null; on_roster: boolean }

function RosterEditor({ event, onClose }: { event: EventYear; onClose: () => void }) {
  const q = useQuery({ queryKey: ['year', event.year, 'roster'], queryFn: async () => (await api.get<{ roster: RosterRow[] }>(`/events/${event.year}/roster`)).data.roster });
  const [edits, setEdits] = useState<Record<number, { expected: string; onRoster: boolean }>>({});
  const rows = q.data ?? [];
  const val = (r: RosterRow) => edits[r.user_id] ?? { expected: String(r.expected_amount ?? event.default_expected_contribution), onRoster: r.on_roster };
  const save = useSave(
    () => api.put(`/events/${event.year}/roster`, {
      members: Object.entries(edits).map(([id, v]) => ({ userId: Number(id), expected: Number(v.expected) || 0, onRoster: v.onRoster })),
    }),
    { success: 'Contribution list saved', onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} size="lg" title={`Contribution list · ${event.year}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!Object.keys(edits).length}>Save</Button></>}>
      <p className="mb-3 text-sm text-muted">Who is expected to contribute this year, and how much. Paid and pending amounts are calculated from payments.</p>
      {q.isLoading ? <Loading /> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const v = val(r);
            return (
              <li key={r.user_id} className="flex items-center gap-3 py-2">
                <input type="checkbox" className="size-4 accent-brand-700" checked={v.onRoster} onChange={(e) => setEdits({ ...edits, [r.user_id]: { ...v, onRoster: e.target.checked } })} aria-label={`${r.name} on list`} />
                <span className={`flex-1 text-sm ${v.onRoster ? '' : 'text-muted line-through'}`}>{r.name}{!r.is_active && ' (inactive)'}</span>
                <div className="w-36"><MoneyInput value={v.expected} disabled={!v.onRoster} onChange={(e) => setEdits({ ...edits, [r.user_id]: { ...v, expected: e.target.value } })} aria-label={`${r.name} expected amount`} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function ArchiveDialog({ event, onClose }: { event: EventYear; onClose: () => void }) {
  const [text, setText] = useState('');
  const del = useSave(() => api.delete(`/events/${event.year}`, { data: { confirm: Number(text) } }), { success: `${event.year} archived`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} size="sm" title={`Archive ${event.year}?`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={text !== String(event.year)} loading={del.isPending} onClick={() => del.mutate(undefined)}>Archive year</Button></>}>
      <p className="text-sm text-muted">The year disappears from the app and the public site. Its records are kept in the database and the audit log. Type <strong className="text-ink">{event.year}</strong> to confirm.</p>
      <Input className="mt-3" value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" />
    </Modal>
  );
}
