import { Lock } from 'lucide-react';
import { ContributionStatusBar, ExpenseByCategoryChart, IncomeVsExpenseChart, YearlyTrendChart } from '../../components/charts/Charts';
import { EmptyState, ErrorState, Loading, StatusBadge } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { fmtDate, inr } from '../../lib/format';
import { PublicPageHeader, Section, usePublicFinance, usePublicYear, type PublicFinance } from './shared';

export default function Finance() {
  const { year, years, setYear, loading } = usePublicYear();
  const q = usePublicFinance(year);
  return (
    <>
      <PublicPageHeader title={year ? `Finances ${year}` : 'Finances'} subtitle="Every figure below is calculated live from the recorded contributions, income and expenses." year={year} years={years} setYear={setYear} />
      {loading || q.isLoading ? <Loading /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : !q.data ? <EmptyState title="No published years yet" /> : <FinanceReport data={q.data} />}
    </>
  );
}

export function FinanceReport({ data, compact }: { data: PublicFinance; compact?: boolean }) {
  if (!data.available) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="card"><EmptyState icon={<Lock className="size-6" />} title="Financial summary not published for this year" /></div>
      </div>
    );
  }
  const t = data.totals;
  const c = data.contributors;
  return (
    <>
      <Section title="Summary">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="card p-5">
            <dl className="space-y-2.5">
              <Line label="Member contributions" value={t.contributions} />
              <Line label="Saree sales" value={t.sareeSales} />
              <Line label="Other income" value={t.otherIncome} />
              <Line label="Total income" value={t.totalIncome} strong />
              <Line label="Total expenses" value={t.totalExpenses} strong />
              <div className="flex items-baseline justify-between border-t-2 border-ink pt-3">
                <dt className="text-lg font-semibold">Current balance</dt>
                <dd className={`money text-2xl font-bold ${t.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{inr(t.balance)}</dd>
              </div>
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="mb-2 font-semibold">Income vs expenses</h3>
            <IncomeVsExpenseChart income={t.totalIncome} expenses={t.totalExpenses} />
            <h3 className="mb-3 mt-4 font-semibold">Contributions</h3>
            <ContributionStatusBar paid={c.paid} partial={c.partial} pending={c.pending} />
            <p className="mt-3 text-sm text-muted">{c.contributed} of {c.members} team members have contributed · {c.pending} pending</p>
          </div>
        </div>
      </Section>

      <Section title="Where the money was spent">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="card p-5">{data.byCategory.length ? <ExpenseByCategoryChart data={data.byCategory} /> : <EmptyState title="No expenses yet" />}</div>
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Category</th><th className="text-right">Amount</th><th className="text-right">Share</th></tr></thead>
              <tbody>
                {data.byCategory.map((r) => (
                  <tr key={r.category}><td>{r.category}</td><td className="money text-right font-medium">{inr(r.amount)}</td><td className="text-right text-muted">{t.totalExpenses ? Math.round((r.amount / t.totalExpenses) * 100) : 0}%</td></tr>
                ))}
                <tr className="font-semibold"><td>Total</td><td className="money text-right">{inr(t.totalExpenses)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {c.list && (
        <Section title="Contribution sheet">
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Member</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>{c.list.map((r, i) => <tr key={i}><td>{r.name}</td><td className="money text-right">{inr(r.amount)}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}

      {data.expenses && !compact && (
        <Section title="Itemised expenses">
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{data.expenses.map((e, i) => <tr key={i}><td className="whitespace-nowrap text-muted">{fmtDate(e.spent_on)}</td><td>{e.category}</td><td>{e.description}</td><td className="money text-right">{inr(e.amount)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Bills and payment proofs are kept privately by the organising team.</p>
        </Section>
      )}

      {!compact && data.trend.length > 1 && (
        <Section title="Year by year">
          <div className="card p-5"><YearlyTrendChart data={data.trend} /></div>
        </Section>
      )}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t border-line pt-2.5 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className="money">{inr(value)}</dd>
    </div>
  );
}
