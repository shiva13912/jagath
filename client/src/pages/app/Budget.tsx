import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RequireYear } from '../../components/NoYear';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, MoneyInput, PageHeader, StatCard, Textarea } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { fmtDate, fmtDateTime, inr, todayIso } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import { useDashboard } from '../../lib/queries';
import type { OtherIncome } from '../../lib/types';

export default function Budget() {
  return <RequireYear>{(year) => <BudgetFor year={year} />}</RequireYear>;
}

function BudgetFor({ year }: { year: number }) {
  const { isAdmin } = useAuth();
  const dash = useDashboard(year);
  const budget = useQuery({
    queryKey: ['year', year, 'budget'],
    queryFn: async () => (await api.get<{ budget: { planned_amount: number; notes: string | null; updated_at?: string; updated_by_name?: string } }>(`/events/${year}/budget`)).data.budget,
  });
  const income = useQuery({
    queryKey: ['year', year, 'other-income'],
    queryFn: async () => (await api.get<{ items: OtherIncome[] }>(`/events/${year}/other-income`)).data.items,
  });
  const [editBudget, setEditBudget] = useState(false);
  const [incomeForm, setIncomeForm] = useState<OtherIncome | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OtherIncome | null>(null);
  const del = useSave((i: OtherIncome) => api.delete(`/other-income/${i.id}`), { success: 'Income deleted' });

  if (dash.isLoading || budget.isLoading) return <Loading />;
  if (dash.isError || !dash.data) return <ErrorState message={errorMessage(dash.error)} />;
  const f = dash.data.finance;
  const used = f.budget > 0 ? Math.min(100, (f.totalExpenses / f.budget) * 100) : 0;
  const over = f.budget > 0 && f.totalExpenses > f.budget;

  return (
    <>
      <PageHeader title={`Budget ${year}`} subtitle="The plan versus what actually came in and went out." actions={isAdmin && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditBudget(true)}>Edit budget</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Budget vs spent" className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted">Planned budget</p>
              <p className="money text-3xl font-semibold">{inr(f.budget)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Spent so far</p>
              <p className={`money text-2xl font-semibold ${over ? 'text-red-600' : ''}`}>{inr(f.totalExpenses)}</p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${over ? 'bg-red-600' : 'bg-brand-600'}`} style={{ width: `${used}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {f.budget > 0 ? (over ? `Over budget by ${inr(f.totalExpenses - f.budget)}` : `${inr(f.budget - f.totalExpenses)} of the budget left to spend (${f.budgetUsedPct}% used)`) : 'No budget set for this year yet.'}
          </p>
          {budget.data?.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm">{budget.data.notes}</p>}
          {budget.data?.updated_by_name && <p className="mt-2 text-xs text-muted">Last changed by {budget.data.updated_by_name}, {fmtDateTime(budget.data.updated_at)}</p>}
        </Card>
        <StatCard label="Current balance" value={inr(f.balance)} tone={f.balance < 0 ? 'negative' : 'positive'} hint="Calculated by the server from all income and expenses" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Where the money came from">
          <dl className="space-y-2 text-sm">
            <Row label="Member contributions" value={f.contributions} />
            <Row label="Other income" value={f.otherIncome} />
            <Row label="Saree sales" value={f.sareeSales} />
            <Row label="Total income" value={f.totalIncome} strong />
          </dl>
        </Card>
        <Card title="Where the money went">
          <dl className="space-y-2 text-sm">
            <Row label="Expenses" value={f.expenses} />
            <Row label="Saree purchases" value={f.sareePurchases} />
            <Row label="Total expenses" value={f.totalExpenses} strong />
            <Row label="Balance" value={f.balance} strong tone={f.balance < 0 ? 'text-red-600' : 'text-emerald-700'} />
          </dl>
        </Card>
      </div>

      <Card className="mt-5" title="Other income" bodyClassName="p-0" actions={isAdmin && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setIncomeForm('new')}>Add income</Button>}>
        {!income.data?.length ? <EmptyState title="No other income" message="Sponsorships and donations from outside the team go here." /> : (
          <ul className="divide-y divide-line">
            {income.data.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.source}</p>
                  <p className="text-xs text-muted">{fmtDate(i.received_on)} · recorded by {i.created_by_name}{i.notes && ` · ${i.notes}`}</p>
                </div>
                <span className="money font-semibold text-emerald-700">+{inr(i.amount)}</span>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setIncomeForm(i)} aria-label="Edit" />
                    <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(i)} aria-label="Delete" />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editBudget && <BudgetForm year={year} planned={f.budget} notes={budget.data?.notes ?? ''} onClose={() => setEditBudget(false)} />}
      {incomeForm && <IncomeForm year={year} item={incomeForm === 'new' ? null : incomeForm} onClose={() => setIncomeForm(null)} />}
      <ConfirmDialog open={!!deleting} title="Delete income?" message={`${deleting?.source}: ${inr(deleting?.amount)} will stop counting.`} danger confirmLabel="Delete" onConfirm={() => del.mutateAsync(deleting!)} onClose={() => setDeleting(null)} />
    </>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t border-line pt-2 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className={`money ${tone ?? ''}`}>{inr(value)}</dd>
    </div>
  );
}

function BudgetForm({ year, planned, notes, onClose }: { year: number; planned: number; notes: string; onClose: () => void }) {
  const [amount, setAmount] = useState(String(planned || ''));
  const [text, setText] = useState(notes);
  const save = useSave(() => api.put(`/events/${year}/budget`, { plannedAmount: amount || 0, notes: text }), { success: 'Budget saved', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Budget for ${year}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="budget-form" loading={save.isPending}>Save</Button></>}>
      <form id="budget-form" className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(undefined); }}>
        <Field label="Planned budget" required><MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Notes" hint="E.g. how the budget is split. Visible to the team."><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} /></Field>
      </form>
    </Modal>
  );
}

function IncomeForm({ year, item, onClose }: { year: number; item: OtherIncome | null; onClose: () => void }) {
  const [form, setForm] = useState({ amount: item ? String(item.amount) : '', source: item?.source ?? '', receivedOn: item?.received_on ?? todayIso(), notes: item?.notes ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSave(() => (item ? api.put(`/other-income/${item.id}`, form) : api.post(`/events/${year}/other-income`, form)), { success: 'Income saved', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={item ? 'Edit income' : 'Add other income'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="income-form" loading={save.isPending}>Save</Button></>}>
      <form id="income-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); setErrors({}); save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) }); }}>
        <Field label="Source" required error={errors.source} className="sm:col-span-2"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Sponsor, donation box, …" required autoFocus /></Field>
        <Field label="Amount" required error={errors.amount}><MoneyInput value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
        <Field label="Received on" required error={errors.receivedOn}><Input type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} required /></Field>
        <Field label="Notes" className="sm:col-span-2"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
