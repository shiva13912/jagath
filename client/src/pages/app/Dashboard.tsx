import { Camera, HandCoins, Images, Receipt, Shirt, Users, Video, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ContributionStatusBar, ExpenseByCategoryChart, IncomeVsExpenseChart, YearlyTrendChart } from '../../components/charts/Charts';
import { RequireYear } from '../../components/NoYear';
import { RecentMediaStrip } from '../../components/media/RecentMediaStrip';
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/api';
import { fmtDate, inr, timeAgo } from '../../lib/format';
import { useDashboard, useTrend, type Dashboard as D } from '../../lib/queries';

export default function Dashboard() {
  return <RequireYear>{(year) => <DashboardFor year={year} />}</RequireYear>;
}

function DashboardFor({ year }: { year: number }) {
  const { user, isAdmin } = useAuth();
  const q = useDashboard(year);
  const trend = useTrend();
  if (q.isLoading) return <Loading label="Calculating totals…" />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const f = d.finance;

  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · totals are calculated from every recorded transaction
          </span>
        }
      />

      {!isAdmin && (
        <div className="mb-5 grid gap-4 md:grid-cols-[1.2fr_2fr]">
          <MyContribution d={d} name={user!.name} />
          <QuickActionsCard />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total budget" value={inr(f.budget)} hint={f.budgetUsedPct != null ? `${f.budgetUsedPct}% used by expenses` : 'No budget set'} icon={<Wallet className="size-4" />} />
        <StatCard
          label="Total income"
          value={inr(f.totalIncome)}
          hint={`Contributions ${inr(f.contributions)} · Other ${inr(f.otherIncome)} · Sarees ${inr(f.sareeSales)}`}
        />
        <StatCard label="Total expenses" value={inr(f.totalExpenses)} hint={f.sareePurchases ? `Includes ${inr(f.sareePurchases)} saree purchases` : undefined} />
        <StatCard label="Current balance" value={inr(f.balance)} tone={f.balance < 0 ? 'negative' : 'positive'} hint="Income minus expenses" />
      </div>

      {isAdmin && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Members" value={d.contributions.members} hint={`${d.contributions.paid} paid · ${d.contributions.partial} partial · ${d.contributions.pending} pending`} icon={<Users className="size-4" />} />
          <StatCard label="Photos" value={d.media.photos} hint={d.media.unpublished ? `${d.media.unpublished} awaiting approval` : 'All published'} icon={<Images className="size-4" />} />
          <StatCard label="Videos" value={d.media.videos} icon={<Video className="size-4" />} />
          <StatCard label="Sarees" value={`${d.sarees.sold} / ${d.sarees.purchased}`} hint={`sold of purchased · ${d.sarees.remaining} left`} icon={<Shirt className="size-4" />} />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Expense by category" actions={<Link to="/app/expenses" className="text-sm text-brand-700 hover:underline">All expenses</Link>}>
          {d.expensesByCategory.length ? <ExpenseByCategoryChart data={d.expensesByCategory} /> : <EmptyState title="No expenses yet" />}
        </Card>
        <div className="grid gap-5">
          <Card title="Income vs expenses">
            <IncomeVsExpenseChart income={f.totalIncome} expenses={f.totalExpenses} />
            <p className="mt-1 text-sm text-muted">
              Balance: <span className={`money font-semibold ${f.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{inr(f.balance)}</span>
            </p>
          </Card>
          <Card title="Contribution status" actions={<Link to="/app/contributions" className="text-sm text-brand-700 hover:underline">Details</Link>}>
            <ContributionStatusBar paid={d.contributions.paid} partial={d.contributions.partial} pending={d.contributions.pending} />
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
              <div><dt className="text-muted">Expected</dt><dd className="money font-semibold">{inr(d.contributions.expected)}</dd></div>
              <div><dt className="text-muted">Received</dt><dd className="money font-semibold text-emerald-700">{inr(d.contributions.received)}</dd></div>
              <div><dt className="text-muted">Pending</dt><dd className="money font-semibold text-red-600">{inr(d.contributions.pendingAmount)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Sarees" className="lg:col-span-1" actions={<Link to="/app/sarees" className="text-sm text-brand-700 hover:underline">Open</Link>}>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-muted">Purchased</dt><dd className="text-xl font-semibold">{d.sarees.purchased}</dd></div>
            <div><dt className="text-xs text-muted">Sold</dt><dd className="text-xl font-semibold">{d.sarees.sold}</dd></div>
            <div><dt className="text-xs text-muted">Remaining</dt><dd className="text-xl font-semibold text-brand-700">{d.sarees.remaining}</dd></div>
          </dl>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Purchase cost</dt><dd className="money">{inr(d.sarees.purchaseCost)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Sales revenue</dt><dd className="money">{inr(d.sarees.salesRevenue)}</dd></div>
          </dl>
        </Card>
        <Card title="Yearly expense trend" className="lg:col-span-2">
          {trend.data && trend.data.length > 0 ? <YearlyTrendChart data={trend.data} /> : <EmptyState title="Trend appears once there are several years" />}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Recent expenses" bodyClassName="p-0">
          {d.recentExpenses.length === 0 ? (
            <EmptyState title="No expenses yet" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentExpenses.map((e) => (
                <li key={e.id}>
                  <Link to={`/app/expenses?open=${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                    <span className="rounded-lg bg-orange-50 p-2 text-orange-700"><Receipt className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.description}</span>
                      <span className="block text-xs text-muted">{e.paid_by_name} · {e.category} · {fmtDate(e.spent_on, false)}</span>
                    </span>
                    <span className="money text-sm font-semibold">{inr(e.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent contributions" bodyClassName="p-0">
          {d.recentContributions.length === 0 ? (
            <EmptyState title="No contributions yet" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentContributions.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="rounded-lg bg-sky-50 p-2 text-sky-700"><HandCoins className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.member_name}</span>
                    <span className="block text-xs text-muted">{fmtDate(c.paid_on)} {c.has_proof && '· proof attached'}</span>
                  </span>
                  <span className="money text-sm font-semibold text-emerald-700">+{inr(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Highest expenses" bodyClassName="p-0">
          {d.highestExpenses.length === 0 ? <EmptyState title="No expenses yet" /> : (
            <table className="table-base">
              <tbody>
                {d.highestExpenses.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/app/expenses?open=${e.id}`} className="font-medium hover:text-brand-700">{e.description}</Link><div className="text-xs text-muted">{e.category} · {e.paid_by_name}</div></td>
                    <td className="money text-right font-semibold">{inr(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Recent activity" bodyClassName="p-0" actions={isAdmin && <Link to="/app/activity" className="text-sm text-brand-700 hover:underline">Full log</Link>}>
          {d.recentActivity.length === 0 ? <EmptyState title="Nothing yet" /> : (
            <ul className="divide-y divide-line">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <p>{a.summary}</p>
                  <p className="text-xs text-muted">{timeAgo(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Recent photos & videos" actions={<Link to="/app/photos" className="text-sm text-brand-700 hover:underline">Gallery</Link>}>
          <RecentMediaStrip year={year} />
        </Card>
      </div>
      <p className="mt-4 text-right text-xs text-muted">Updated {timeAgo(d.generatedAt)}</p>
    </>
  );
}

function MyContribution({ d, name }: { d: D; name: string }) {
  const m = d.myContribution;
  return (
    <Card title="My contribution">
      {!m ? (
        <p className="text-sm text-muted">{name}, you are not on this year's contribution list yet. Adding a payment adds you automatically.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <StatusBadge status={m.status} />
            {m.lastPaidOn && <span className="text-xs text-muted">Last paid {fmtDate(m.lastPaidOn)}</span>}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-muted">Expected</dt><dd className="money text-lg font-semibold">{inr(m.expected)}</dd></div>
            <div><dt className="text-muted">Paid</dt><dd className="money text-lg font-semibold text-emerald-700">{inr(m.paid)}</dd></div>
            <div><dt className="text-muted">Pending</dt><dd className="money text-lg font-semibold text-red-600">{inr(m.pending)}</dd></div>
          </dl>
          {m.pending > 0 && (
            <Link to="/app/contributions?new=1" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
              Add my payment →
            </Link>
          )}
        </>
      )}
    </Card>
  );
}

function QuickActionsCard() {
  const actions = [
    { to: '/app/contributions?new=1', label: 'Add contribution', icon: HandCoins },
    { to: '/app/expenses?new=1', label: 'Add expense', icon: Receipt },
    { to: '/app/photos?upload=1', label: 'Upload photos', icon: Camera },
    { to: '/app/videos?upload=1', label: 'Upload video', icon: Video },
  ];
  return (
    <Card title="Quick actions">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {actions.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-xl border border-line p-3 text-center text-sm font-medium hover:border-brand-300 hover:bg-brand-50">
            <span className="rounded-lg bg-brand-100 p-2 text-brand-700"><Icon className="size-5" /></span>
            {label}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted"><Badge tone="blue">Tip</Badge> On your phone, the red + button at the bottom does the same.</p>
    </Card>
  );
}
