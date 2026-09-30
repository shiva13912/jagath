import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inr, inrShort } from '../../lib/format';

/**
 * Chart colours follow a validated colour-blind-safe palette:
 * categorical slots in fixed order (income = slot 1 blue, expenses = slot 2 orange)
 * and a reserved status palette that is always paired with text labels.
 */
export const SERIES = { income: '#2a78d6', expenses: '#eb6834' };
export const STATUS = { paid: '#0ca30c', partial: '#fab219', pending: '#d03b3b' };
const AXIS = { fontSize: 12, fill: '#6b625c' };
const GRID = '#ece6df';

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-md">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-muted">{p.name}</span>
          <span className="money ml-auto font-medium">{inr(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Magnitude per category: one hue, sorted largest first, value labels at bar ends. */
export function ExpenseByCategoryChart({ data }: { data: Array<{ category: string; amount: number }> }) {
  const height = Math.max(160, data.length * 36 + 20);
  return (
    <div role="img" aria-label="Expenses by category">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tickFormatter={inrShort} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="category" width={112} tick={{ ...AXIS, fill: '#1f1a17' }} axisLine={false} tickLine={false} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(31,26,23,0.04)' }} />
          <Bar dataKey="amount" name="Spent" fill={SERIES.income} radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="amount" position="right" formatter={(v: any) => inrShort(Number(v))} style={{ fontSize: 12, fill: '#1f1a17' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two bars, directly labelled. Balance is shown as text, not a third bar. */
export function IncomeVsExpenseChart({ income, expenses }: { income: number; expenses: number }) {
  const data = [
    { name: 'Income', value: income, fill: SERIES.income },
    { name: 'Expenses', value: expenses, fill: SERIES.expenses },
  ];
  return (
    <div role="img" aria-label={`Income ${inr(income)}, expenses ${inr(expenses)}`}>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="name" width={76} tick={{ ...AXIS, fill: '#1f1a17' }} axisLine={false} tickLine={false} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(31,26,23,0.04)' }} />
          <Bar dataKey="value" name="Amount" radius={[0, 4, 4, 0]} maxBarSize={30}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v: any) => inrShort(Number(v))} style={{ fontSize: 12, fill: '#1f1a17' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Part-to-whole of members by status: one segmented bar with labelled counts. */
export function ContributionStatusBar({ paid, partial, pending }: { paid: number; partial: number; pending: number }) {
  const total = paid + partial + pending;
  const parts = [
    { key: 'paid', label: 'Paid', n: paid, color: STATUS.paid },
    { key: 'partial', label: 'Partial', n: partial, color: STATUS.partial },
    { key: 'pending', label: 'Pending', n: pending, color: STATUS.pending },
  ];
  if (!total) return <p className="text-sm text-muted">No members on this year's roster yet.</p>;
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`${paid} paid, ${partial} partial, ${pending} pending`}>
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <div key={p.key} title={`${p.label}: ${p.n}`} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="text-muted">{p.label}</span>
            <span className="ml-auto font-semibold">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Income and expenses per year (two series, legend + tooltip). */
export function YearlyTrendChart({ data }: { data: Array<{ year: number; income: number; expenses: number }> }) {
  return (
    <div role="img" aria-label="Income and expenses by year">
      <ul className="mb-2 flex gap-4 text-xs">
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES.income }} /> Income</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES.expenses }} /> Expenses</li>
      </ul>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="year" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tickFormatter={inrShort} tick={AXIS} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(31,26,23,0.04)' }} />
          <Bar dataKey="income" name="Income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="expenses" name="Expenses" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
