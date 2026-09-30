import { CalendarDays } from 'lucide-react';

export function YearSelect({
  years,
  value,
  onChange,
  className,
}: {
  years: number[];
  value: number | null;
  onChange: (y: number) => void;
  className?: string;
}) {
  if (!years.length) return null;
  return (
    <label className={`relative inline-flex items-center ${className ?? ''}`}>
      <span className="sr-only">Event year</span>
      <CalendarDays className="pointer-events-none absolute left-2.5 size-4 text-brand-700" aria-hidden />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 appearance-none rounded-xl border border-line bg-white pl-8 pr-8 text-sm font-semibold text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-xs text-muted">▼</span>
    </label>
  );
}
