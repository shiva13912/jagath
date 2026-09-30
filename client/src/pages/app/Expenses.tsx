import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronLeft, ChevronRight, Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilePicker, ProofLink } from '../../components/FilePicker';
import { RequireYear } from '../../components/NoYear';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, MoneyInput, PageHeader, Select } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage, fieldErrors, toFormData } from '../../lib/api';
import { fmtDate, fmtDateTime, inr, todayIso } from '../../lib/format';
import { useDebounced, useSave } from '../../lib/hooks';
import { useCategories, useMembers } from '../../lib/queries';
import type { Expense } from '../../lib/types';

interface ListResponse {
  items: Expense[];
  total: number;
  sum: number;
  page: number;
  pageSize: number;
}

export default function Expenses() {
  return <RequireYear>{(year) => <ExpensesFor year={year} />}</RequireYear>;
}

function ExpensesFor({ year }: { year: number }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const categories = useCategories();
  const members = useMembers();

  const openId = Number(params.get('open')) || null;
  const creating = params.get('new') === '1';
  const [editing, setEditing] = useState<Expense | null>(null);

  useEffect(() => setPage(1), [search, category, paidBy, from, to, sort, year]);

  const list = useQuery({
    queryKey: ['year', year, 'expenses', { search, category, paidBy, from, to, sort, page }],
    queryFn: async () =>
      (
        await api.get<ListResponse>(`/events/${year}/expenses`, {
          params: { q: search || undefined, category: category || undefined, paidBy: paidBy || undefined, from: from || undefined, to: to || undefined, sort, page, pageSize: 20 },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };
  const filtered = !!(search || category || paidBy || from || to);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title={`Expenses ${year}`}
        subtitle="Every rupee spent for the event, with proof. Everyone on the team can see this list."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setParam('new', '1')}>Add expense</Button>}
      />

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Search reason, vendor, member" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search expenses" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} aria-label="Spent by">
          <option value="">All members</option>
          {members.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted">
          {list.data ? (
            <>
              <span className="font-medium text-ink">{list.data.total}</span> expense{list.data.total === 1 ? '' : 's'} ·{' '}
              <span className="money font-semibold text-ink">{inr(list.data.sum)}</span>
              {filtered && ' (filtered)'}
            </>
          ) : ' '}
          {filtered && (
            <button className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => { setQ(''); setCategory(''); setPaidBy(''); setFrom(''); setTo(''); }}>
              <X className="size-3.5" /> Clear filters
            </button>
          )}
        </p>
        <label className="inline-flex items-center gap-2">
          <ArrowDownUp className="size-4 text-muted" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm" aria-label="Sort">
            <option value="date_desc">Newest date</option>
            <option value="date_asc">Oldest date</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
            <option value="created_desc">Recently added</option>
          </select>
        </label>
      </div>

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        <div className="card">
          <EmptyState title={filtered ? 'No matching expenses' : 'No expenses recorded yet'} message={filtered ? 'Try clearing the filters.' : 'Record the first expense with its bill.'} />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th>Spent by</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setParam('open', String(e.id))}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(e.spent_on)}</td>
                    <td>
                      <span className="font-medium">{e.description}</span>
                      {e.vendor && <span className="block text-xs text-muted">{e.vendor}</span>}
                    </td>
                    <td><Badge>{e.category}</Badge></td>
                    <td className="money whitespace-nowrap text-right font-semibold">{inr(e.amount)}</td>
                    <td className="whitespace-nowrap">{e.paid_by_name}</td>
                    <td>{e.proof_count > 0 ? <span className="inline-flex items-center gap-1 text-brand-700"><Paperclip className="size-3.5" /> View</span> : <span className="text-muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {list.data.items.map((e) => (
              <li key={e.id}>
                <button className="card flex w-full items-start gap-3 p-3 text-left" onClick={() => setParam('open', String(e.id))}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.description}</span>
                    <span className="mt-0.5 block text-xs text-muted">{fmtDate(e.spent_on)} · {e.paid_by_name}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <Badge>{e.category}</Badge>
                      {e.proof_count > 0 && <span className="inline-flex items-center gap-1 text-xs text-brand-700"><Paperclip className="size-3" /> {e.proof_count}</span>}
                    </span>
                  </span>
                  <span className="money font-semibold">{inr(e.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-4" />}>Prev</Button>
              <span>Page {page} of {pages}</span>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="size-4" /></Button>
            </div>
          )}
        </>
      )}

      {(creating || editing) && (
        <ExpenseForm
          year={year}
          expense={editing}
          onClose={() => {
            setEditing(null);
            setParam('new', null);
          }}
        />
      )}
      {openId && !editing && (
        <ExpenseDetail
          id={openId}
          onClose={() => setParam('open', null)}
          onEdit={(e) => setEditing(e)}
        />
      )}
    </>
  );
}

function ExpenseForm({ year, expense, onClose }: { year: number; expense: Expense | null; onClose: () => void }) {
  const { user } = useAuth();
  const categories = useCategories();
  const members = useMembers();
  const [form, setForm] = useState({
    amount: expense ? String(expense.amount) : '',
    spentOn: expense?.spent_on ?? todayIso(),
    categoryId: expense ? String(expense.category_id) : '',
    description: expense?.description ?? '',
    paidBy: String(expense?.paid_by ?? user!.id),
    vendor: expense?.vendor ?? '',
    notes: (expense as any)?.notes ?? '',
  });
  const [payment, setPayment] = useState<File[]>([]);
  const [bill, setBill] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useSave(
    () => {
      const fd = toFormData({ ...form, payment, bill });
      return expense ? api.put(`/expenses/${expense.id}`, fd) : api.post(`/events/${year}/expenses`, fd);
    },
    { success: expense ? 'Expense updated' : 'Expense added. The dashboard is updated.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) });
  }

  const sareeCategory = categories.data?.find((c) => c.id === Number(form.categoryId))?.name.toLowerCase() === 'sarees';

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : `Add expense · ${year}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="expense-form" loading={save.isPending} size="lg">{expense ? 'Save changes' : 'Save expense'}</Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={errors.amount}>
          <MoneyInput value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="4000" required autoFocus />
        </Field>
        <Field label="Date" required error={errors.spentOn}>
          <Input type="date" value={form.spentOn} onChange={(e) => set('spentOn', e.target.value)} required max={todayIso()} />
        </Field>
        <Field label="Category" required error={errors.categoryId}>
          <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
            <option value="">Choose…</option>
            {categories.data?.filter((c) => c.is_active || String(c.id) === form.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Spent by" required error={errors.paidBy}>
          <Select value={form.paidBy} onChange={(e) => set('paidBy', e.target.value)}>
            {members.data?.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === user!.id ? ' (me)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Reason" required error={errors.description} className="sm:col-span-2">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Decoration materials" required maxLength={500} />
        </Field>
        {sareeCategory && (
          <p className="rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700 sm:col-span-2">
            Buying sarees to sell? Record it under <strong>Sarees → Add purchase</strong> instead so the stock count stays correct. Purchases there already count as expenses.
          </p>
        )}
        <Field label="Vendor / shop" error={errors.vendor}>
          <Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Notes" error={errors.notes}>
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
        </Field>
        <FilePicker label="Payment screenshot" files={payment} onChange={setPayment} multiple hint="UPI screenshot or bank receipt. Only the team can see it." />
        <FilePicker label="Bill / receipt" files={bill} onChange={setBill} multiple hint="Photo of the shop bill, or a PDF." />
        {expense && <p className="text-xs text-muted sm:col-span-2">New files are added to the existing proofs. Remove old ones from the expense details.</p>}
      </form>
    </Modal>
  );
}

function ExpenseDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (e: Expense) => void }) {
  const { user, isAdmin } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({
    queryKey: ['expense', id],
    queryFn: async () => (await api.get<{ expense: Expense & { notes: string | null; updated_by_name: string | null; history: any[] } }>(`/expenses/${id}`)).data.expense,
  });
  const del = useSave(() => api.delete(`/expenses/${id}`), { success: 'Expense deleted', onSuccess: onClose });
  const removeProof = useSave((proofId: number) => api.delete(`/expense-proofs/${proofId}`), { success: 'Proof removed' });
  const e = q.data;
  const canEdit = !!e && (isAdmin || e.created_by === user!.id);

  return (
    <Modal
      open
      onClose={onClose}
      title="Expense details"
      size="lg"
      footer={
        e && (
          <>
            {isAdmin && <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            {canEdit && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => onEdit(e)}>Edit</Button>}
            <Button onClick={onClose}>Close</Button>
          </>
        )
      }
    >
      {q.isLoading ? <Loading /> : q.isError || !e ? <ErrorState message={errorMessage(q.error)} /> : (
        <div className="space-y-5">
          <div>
            <p className="money text-3xl font-semibold">{inr(e.amount)}</p>
            <p className="mt-1 text-lg">{e.description}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Item label="Spent by" value={e.paid_by_name} />
            <Item label="Category" value={e.category} />
            <Item label="Date" value={fmtDate(e.spent_on)} />
            <Item label="Vendor" value={e.vendor ?? '—'} />
            <Item label="Recorded by" value={`${e.created_by_name}, ${fmtDateTime(e.created_at)}`} />
            <Item label="Last updated" value={e.updated_by_name ? `${e.updated_by_name}, ${fmtDateTime(e.updated_at)}` : '—'} />
            {e.notes && <Item label="Notes" value={e.notes} className="col-span-full" />}
          </dl>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Proofs ({e.proofs?.length ?? 0})</h3>
            {e.proofs?.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {e.proofs.map((p) => (
                  <li key={p.proof_id} className="relative">
                    <ProofLink file={p} label={p.kind === 'payment' ? 'Payment proof' : 'Bill'} />
                    {canEdit && (
                      <button className="absolute right-2 top-2 rounded-lg bg-white/90 p-1 text-muted hover:text-red-600" onClick={() => removeProof.mutate(p.proof_id!)} aria-label="Remove proof">
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No proof uploaded yet.</p>}
          </div>
          {e.history?.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
                {e.history.map((h, i) => (
                  <li key={i}>
                    <p>{h.summary}</p>
                    <p className="text-xs text-muted">{fmtDateTime(h.created_at)}</p>
                    {h.details && typeof h.details === 'object' && Object.entries(h.details).filter(([, v]: any) => v && typeof v === 'object' && 'from' in v).map(([k, v]: any) => (
                      <p key={k} className="text-xs text-muted">{k.replace(/_/g, ' ')}: <s>{String(v.from ?? '—')}</s> → {String(v.to ?? '—')}</p>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this expense?"
        message="It will stop counting in the totals. The record and its history stay in the audit log."
        confirmLabel="Delete expense"
        danger
        onConfirm={() => del.mutateAsync(undefined)}
        onClose={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

function Item({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

