import { useQuery } from '@tanstack/react-query';
import { Paperclip, Pencil, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FilePicker } from '../../components/FilePicker';
import { RequireYear } from '../../components/NoYear';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, MoneyInput, PageHeader, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage, fieldErrors, toFormData } from '../../lib/api';
import { fmtDate, inr, todayIso } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import type { SareePurchase, SareeSale, SareeSummary } from '../../lib/types';

interface Resp { summary: SareeSummary; purchases: SareePurchase[]; sales: SareeSale[] }
interface HistoryRow { year: number; purchased: number; purchase_cost: number; sold: number; sales_revenue: number; remaining: number }

export default function Sarees() {
  return <RequireYear>{(year) => <SareesFor year={year} />}</RequireYear>;
}

function SareesFor({ year }: { year: number }) {
  const { user, isAdmin } = useAuth();
  const q = useQuery({ queryKey: ['year', year, 'sarees'], queryFn: async () => (await api.get<Resp>(`/events/${year}/sarees`)).data });
  const history = useQuery({ queryKey: ['saree-history'], queryFn: async () => (await api.get<{ history: HistoryRow[] }>('/sarees/history')).data.history });
  const [form, setForm] = useState<{ kind: 'purchase' | 'sale'; item: SareePurchase | SareeSale | null } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'purchase' | 'sale'; id: number; label: string } | null>(null);
  const del = useSave((d: { kind: string; id: number }) => api.delete(`/saree-${d.kind === 'purchase' ? 'purchases' : 'sales'}/${d.id}`), { success: 'Deleted' });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data.summary;
  const soldPct = s.purchased ? Math.round((s.sold / s.purchased) * 100) : 0;

  return (
    <>
      <PageHeader
        title={`Sarees ${year}`}
        subtitle="Purchases count as expenses and sales as income. Stock is purchased minus sold."
        actions={
          <>
            <Button variant="secondary" icon={<ShoppingBag className="size-4" />} onClick={() => setForm({ kind: 'purchase', item: null })}>Add purchase</Button>
            <Button icon={<Tag className="size-4" />} onClick={() => setForm({ kind: 'sale', item: null })} disabled={s.remaining <= 0}>Record sale</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Purchased" value={s.purchased} hint={`avg ${inr(s.avgPurchasePrice)} each`} />
        <StatCard label="Sold" value={s.sold} hint={`${soldPct}% of stock`} />
        <StatCard label="Remaining" value={s.remaining} tone="brand" />
        <StatCard label="Purchase cost" value={inr(s.purchaseCost)} />
        <StatCard label="Sales revenue" value={inr(s.salesRevenue)} hint={s.purchaseCost ? (s.profit >= 0 ? `Surplus of ${inr(s.profit)} over cost` : `${Math.round((s.salesRevenue / s.purchaseCost) * 100)}% of cost recovered`) : undefined} tone="positive" />
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Share of sarees sold" aria-valuenow={soldPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${soldPct}%` }} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={`Purchases (${q.data.purchases.length})`} bodyClassName="p-0">
          {!q.data.purchases.length ? <EmptyState title="No purchases yet" /> : (
            <ul className="divide-y divide-line">
              {q.data.purchases.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.quantity} sarees × {inr(p.unit_price)}</p>
                    <p className="text-xs text-muted">{fmtDate(p.purchased_on)}{p.vendor && ` · ${p.vendor}`}{p.purchased_by_name && ` · by ${p.purchased_by_name}`}</p>
                    {p.notes && <p className="text-sm text-muted">{p.notes}</p>}
                    <div className="mt-1 flex gap-3 text-xs">
                      {p.proof && <a className="inline-flex items-center gap-1 text-brand-700 hover:underline" href={`/api/files/${p.proof.id}`} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> Bill</a>}
                      {p.photo && <a className="inline-flex items-center gap-1 text-brand-700 hover:underline" href={`/api/files/${p.photo.id}`} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> Photo</a>}
                    </div>
                  </div>
                  <span className="money font-semibold">{inr(p.total_amount)}</span>
                  <RowActions canEdit={isAdmin || p.created_by === user!.id} canDelete={isAdmin} onEdit={() => setForm({ kind: 'purchase', item: p })} onDelete={() => setDeleting({ kind: 'purchase', id: p.id, label: `${p.quantity} sarees from ${p.vendor ?? 'vendor'}` })} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Sales (${q.data.sales.length})`} bodyClassName="p-0">
          {!q.data.sales.length ? <EmptyState title="No sales yet" /> : (
            <ul className="divide-y divide-line">
              {q.data.sales.map((x) => (
                <li key={x.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{x.customer_name}</p>
                    <p className="text-xs text-muted">{fmtDate(x.sold_on)} · {x.quantity} × {inr(x.unit_price)} · recorded by {x.recorded_by_name}</p>
                    {x.notes && <p className="text-sm text-muted">{x.notes}</p>}
                  </div>
                  <span className="money font-semibold text-emerald-700">+{inr(x.total_amount)}</span>
                  <RowActions canEdit={isAdmin || x.created_by === user!.id} canDelete={isAdmin} onEdit={() => setForm({ kind: 'sale', item: x })} onDelete={() => setDeleting({ kind: 'sale', id: x.id, label: `sale to ${x.customer_name}` })} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5" title="Year-wise saree report" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Year</th><th className="text-right">Purchased</th><th className="text-right">Sold</th><th className="text-right">Remaining</th><th className="text-right">Cost</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {history.data?.map((h) => (
                <tr key={h.year} className={h.year === year ? 'bg-gold-50/60' : ''}>
                  <td className="font-semibold">{h.year}</td>
                  <td className="text-right">{h.purchased}</td>
                  <td className="text-right">{h.sold}</td>
                  <td className="text-right">{h.remaining}</td>
                  <td className="money text-right">{inr(h.purchase_cost)}</td>
                  <td className="money text-right">{inr(h.sales_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {form?.kind === 'purchase' && <PurchaseForm year={year} item={form.item as SareePurchase | null} onClose={() => setForm(null)} />}
      {form?.kind === 'sale' && <SaleForm year={year} remaining={s.remaining} item={form.item as SareeSale | null} onClose={() => setForm(null)} />}
      <ConfirmDialog open={!!deleting} title="Delete this record?" message={`The ${deleting?.label} will stop counting in stock and totals. The audit log keeps a record.`} danger confirmLabel="Delete" onConfirm={() => del.mutateAsync(deleting!)} onClose={() => setDeleting(null)} />
    </>
  );
}

function RowActions({ canEdit, canDelete, onEdit, onDelete }: { canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex">
      {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={onEdit} aria-label="Edit" />}
      {canDelete && <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={onDelete} aria-label="Delete" />}
    </span>
  );
}

function PurchaseForm({ year, item, onClose }: { year: number; item: SareePurchase | null; onClose: () => void }) {
  const [f, setF] = useState({ purchasedOn: item?.purchased_on ?? todayIso(), vendor: item?.vendor ?? '', quantity: item ? String(item.quantity) : '', unitPrice: item ? String(item.unit_price) : '', notes: item?.notes ?? '' });
  const [bill, setBill] = useState<File[]>([]);
  const [photo, setPhoto] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const total = (Number(f.quantity) || 0) * (Number(f.unitPrice) || 0);
  const save = useSave(() => {
    const fd = toFormData({ ...f, bill: bill[0], photo: photo[0] });
    return item ? api.put(`/saree-purchases/${item.id}`, fd) : api.post(`/events/${year}/sarees/purchases`, fd);
  }, { success: 'Purchase saved', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={item ? 'Edit purchase' : 'Add saree purchase'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="purchase-form" size="lg" loading={save.isPending}>Save</Button></>}>
      <form id="purchase-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); setErrors({}); save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) }); }}>
        <Field label="Quantity" required error={errors.quantity}><Input type="number" inputMode="numeric" min={1} step={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required autoFocus /></Field>
        <Field label="Price per saree" required error={errors.unitPrice}><MoneyInput value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} required /></Field>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm sm:col-span-2">Total: <strong className="money">{inr(total)}</strong> (calculated)</p>
        <Field label="Date" required error={errors.purchasedOn}><Input type="date" value={f.purchasedOn} onChange={(e) => setF({ ...f, purchasedOn: e.target.value })} required /></Field>
        <Field label="Supplier / vendor"><Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <FilePicker label="Bill / payment proof" files={bill} onChange={setBill} />
        <FilePicker label="Photo (optional)" files={photo} onChange={setPhoto} accept="image/*" />
      </form>
    </Modal>
  );
}

function SaleForm({ year, remaining, item, onClose }: { year: number; remaining: number; item: SareeSale | null; onClose: () => void }) {
  const [f, setF] = useState({ soldOn: item?.sold_on ?? todayIso(), customerName: item?.customer_name ?? '', quantity: item ? String(item.quantity) : '1', unitPrice: item ? String(item.unit_price) : '', notes: item?.notes ?? '' });
  const [photo, setPhoto] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const available = remaining + (item?.quantity ?? 0);
  const save = useSave(() => {
    const fd = toFormData({ ...f, photo: photo[0] });
    return item ? api.put(`/saree-sales/${item.id}`, fd) : api.post(`/events/${year}/sarees/sales`, fd);
  }, { success: 'Sale saved', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={item ? 'Edit sale' : 'Record saree sale'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="sale-form" size="lg" loading={save.isPending}>Save</Button></>}>
      <form id="sale-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); setErrors({}); save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) }); }}>
        <Field label="Customer / person" required error={errors.customerName} className="sm:col-span-2"><Input value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} required autoFocus /></Field>
        <Field label="Quantity" required error={errors.quantity} hint={`${available} available`}><Input type="number" inputMode="numeric" min={1} max={available} step={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required /></Field>
        <Field label="Price each" required error={errors.unitPrice}><MoneyInput value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} required /></Field>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm sm:col-span-2">Total: <strong className="money">{inr((Number(f.quantity) || 0) * (Number(f.unitPrice) || 0))}</strong></p>
        <Field label="Date" required><Input type="date" value={f.soldOn} onChange={(e) => setF({ ...f, soldOn: e.target.value })} required /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="sm:col-span-2"><FilePicker label="Photo (optional)" files={photo} onChange={setPhoto} accept="image/*" /></div>
      </form>
    </Modal>
  );
}

