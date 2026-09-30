import { EmptyState, Loading } from '../../components/ui';
import { fmtDate, inr } from '../../lib/format';
import { PublicPageHeader, Section, usePublicSarees, usePublicYear } from './shared';

export default function Sarees() {
  const { year, years, setYear, loading } = usePublicYear();
  return (
    <>
      <PublicPageHeader title={year ? `Saree history ${year}` : 'Saree history'} subtitle="Sarees offered to the Goddess and shared with devotees, tracked every year." year={year} years={years} setYear={setYear} />
      {loading ? <Loading /> : <SareeReport year={year} />}
    </>
  );
}

export function SareeReport({ year, compact }: { year: number | null; compact?: boolean }) {
  const q = usePublicSarees(year);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <EmptyState title="Nothing to show" />;
  const s = q.data.summary;
  const pct = s.purchased ? Math.round((s.sold / s.purchased) * 100) : 0;
  return (
    <>
      <Section title={compact ? 'Sarees' : 'This year'}>
        <div className="grid grid-cols-3 gap-3">
          {[['Purchased', s.purchased], ['Sold', s.sold], ['Remaining', s.remaining]].map(([l, v]) => (
            <div key={l} className="card p-4 text-center">
              <p className="text-sm text-muted">{l}</p>
              <p className="mt-1 text-3xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-sm text-muted">{pct}% of sarees sold{s.salesRevenue !== undefined && ` · ${inr(s.salesRevenue)} raised from sales against ${inr(s.purchaseCost!)} spent`}</p>
      </Section>
      {q.data.sales && !compact && (
        <Section title="Sales">
          {q.data.sales.length === 0 ? <div className="card"><EmptyState title="No sales recorded yet" /></div> : (
            <div className="card overflow-hidden">
              <table className="table-base">
                <thead><tr><th>Date</th><th className="text-right">Quantity</th><th className="text-right">Price each</th><th className="text-right">Total</th></tr></thead>
                <tbody>{q.data.sales.map((x, i) => <tr key={i}><td>{fmtDate(x.sold_on)}</td><td className="text-right">{x.quantity}</td><td className="money text-right">{inr(x.unit_price)}</td><td className="money text-right">{inr(x.total_amount)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      {!compact && (
        <Section title="Every year">
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Year</th><th className="text-right">Purchased</th><th className="text-right">Sold</th><th className="text-right">Remaining</th></tr></thead>
              <tbody>{q.data.history.map((h) => <tr key={h.year} className={h.year === year ? 'bg-gold-50/70' : ''}><td className="font-semibold">{h.year}</td><td className="text-right">{h.purchased}</td><td className="text-right">{h.sold}</td><td className="text-right">{h.remaining}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
