import { useQuery } from '@tanstack/react-query';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilePicker, ProofLink } from '../../components/FilePicker';
import { RequireYear } from '../../components/NoYear';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, MoneyInput, PageHeader, Select, StatCard, StatusBadge, type ContributionStatus } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage, fieldErrors, toFormData } from '../../lib/api';
import { fmtDate, inr, todayIso } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import { useMembers } from '../../lib/queries';
import type { ContributionRow, Payment } from '../../lib/types';

interface Resp {
  summary: { members: number; paid: number; partial: number; pending: number; expected: number; received: number; pendingAmount: number };
  rows: ContributionRow[];
  payments: Payment[];
}

const METHODS: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', other: 'Other' };

export default function Contributions() {
  return <RequireYear>{(year) => <ContributionsFor year={year} />}</RequireYear>;
}

function ContributionsFor({ year }: { year: number }) {
  const { user, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | ContributionStatus>('all');
  const [editing, setEditing] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [tab, setTab] = useState<'status' | 'payments'>('status');
  const creating = params.get('new') === '1';
  const closeCreate = () => {
    const n = new URLSearchParams(params);
    n.delete('new');
    setParams(n, { replace: true });
  };

  const q = useQuery({ queryKey: ['year', year, 'contributions'], queryFn: async () => (await api.get<Resp>(`/events/${year}/contributions`)).data });
  const del = useSave((p: Payment) => api.delete(`/contributions/${p.id}`), { success: 'Contribution deleted' });

  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter), [q.data, filter]);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data.summary;

  return (
    <>
      <PageHeader
        title={`Contributions ${year}`}
        subtitle="Status is worked out automatically from the payments recorded."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>{isAdmin ? 'Add contribution' : 'Add my payment'}</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Members" value={s.members} hint={`${s.paid} paid · ${s.partial} partial · ${s.pending} pending`} />
        <StatCard label="Expected" value={inr(s.expected)} />
        <StatCard label="Received" value={inr(s.received)} tone="positive" />
        <StatCard label="Pending" value={inr(s.pendingAmount)} tone={s.pendingAmount > 0 ? 'negative' : 'default'} />
      </div>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {(['status', 'payments'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>
            {t === 'status' ? 'Member status' : `Payments (${q.data.payments.length})`}
          </button>
        ))}
      </div>

      {tab === 'status' ? (
        <Card className="mt-4" bodyClassName="p-0" title={
          <span className="flex flex-wrap gap-1.5">
            {(['all', 'paid', 'partial', 'pending'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${filter === f ? 'bg-ink text-white' : 'bg-stone-100 text-ink/80 hover:bg-stone-200'}`}>
                {f} {f !== 'all' && `(${s[f]})`}
              </button>
            ))}
          </span>
        }>
          {rows.length === 0 ? <EmptyState title="Nobody in this group" /> : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Member</th><th className="text-right">Expected</th><th className="text-right">Paid</th><th className="text-right">Pending</th><th>Status</th><th className="hidden sm:table-cell">Last paid</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id} className={r.user_id === user!.id ? 'bg-gold-50/60' : ''}>
                      <td className="font-medium">{r.name}{r.user_id === user!.id && <span className="ml-1 text-xs text-muted">(you)</span>}</td>
                      <td className="money text-right">{inr(r.expected)}</td>
                      <td className="money text-right text-emerald-700">{inr(r.paid)}</td>
                      <td className="money text-right text-red-600">{inr(r.pending)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="hidden text-muted sm:table-cell">{fmtDate(r.last_paid_on)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="mt-4" bodyClassName="p-0">
          {q.data.payments.length === 0 ? <EmptyState title="No payments recorded yet" /> : (
            <ul className="divide-y divide-line">
              {q.data.payments.map((p) => {
                const canEdit = isAdmin || p.created_by === user!.id || p.user_id === user!.id;
                return (
                  <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.member_name} <span className="money ml-1 text-emerald-700">+{inr(p.amount)}</span></p>
                      <p className="text-xs text-muted">
                        {fmtDate(p.paid_on)}{p.method && ` · ${METHODS[p.method]}`}{p.reference && ` · Ref ${p.reference}`} · recorded by {p.created_by_name}
                      </p>
                      {p.notes && <p className="mt-0.5 text-sm text-muted">{p.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.proof ? <a className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" href={`/api/files/${p.proof.id}`} target="_blank" rel="noreferrer"><Paperclip className="size-3.5" /> Proof</a> : <span className="text-xs text-muted">No proof</span>}
                      {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>Edit</Button>}
                      {isAdmin && <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(p)} aria-label="Delete" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {(creating || editing) && <PaymentForm year={year} payment={editing} onClose={() => { setEditing(null); closeCreate(); }} />}
      <ConfirmDialog
        open={!!deleting}
        title="Delete contribution?"
        message={`${deleting?.member_name}'s payment of ${inr(deleting?.amount)} will no longer count. The audit log keeps a record.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => del.mutateAsync(deleting!)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function PaymentForm({ year, payment, onClose }: { year: number; payment: Payment | null; onClose: () => void }) {
  const { user, isAdmin } = useAuth();
  const members = useMembers();
  const [form, setForm] = useState({
    userId: String(payment?.user_id ?? user!.id),
    amount: payment ? String(payment.amount) : '',
    paidOn: payment?.paid_on ?? todayIso(),
    method: payment?.method ?? 'upi',
    reference: payment?.reference ?? '',
    notes: payment?.notes ?? '',
  });
  const [proof, setProof] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useSave(
    () => {
      const { userId, ...rest } = form;
      const fd = toFormData({ ...rest, ...(isAdmin && !payment ? { userId } : {}), proof: proof[0] });
      return payment ? api.put(`/contributions/${payment.id}`, fd) : api.post(`/events/${year}/contributions`, fd);
    },
    { success: payment ? 'Contribution updated' : 'Contribution added. Thank you!', onSuccess: onClose },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={payment ? 'Edit contribution' : `Add contribution · ${year}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="payment-form" size="lg" loading={save.isPending}>Save</Button></>}
    >
      <form
        id="payment-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setErrors({});
          save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) });
        }}
      >
        {isAdmin && !payment ? (
          <Field label="Member" required className="sm:col-span-2">
            <Select value={form.userId} onChange={(e) => set('userId', e.target.value)}>
              {members.data?.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-muted sm:col-span-2">Member: <strong className="text-ink">{payment?.member_name ?? user!.name}</strong></p>
        )}
        <Field label="Amount" required error={errors.amount}>
          <MoneyInput value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="5000" required autoFocus />
        </Field>
        <Field label="Payment date" required error={errors.paidOn}>
          <Input type="date" value={form.paidOn} onChange={(e) => set('paidOn', e.target.value)} required max={todayIso()} />
        </Field>
        <Field label="Method">
          <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="UPI / transaction ref" error={errors.reference}>
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
        </Field>
        <div className="sm:col-span-2">
          <FilePicker label={payment?.proof ? 'Replace payment screenshot' : 'Payment screenshot'} files={proof} onChange={setProof} hint="Private: only the team can see it." />
          {payment?.proof && proof.length === 0 && <div className="mt-2"><ProofLink file={payment.proof} label="Current proof" /></div>}
        </div>
      </form>
    </Modal>
  );
}
