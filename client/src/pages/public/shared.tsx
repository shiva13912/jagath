import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { YearSelect } from '../../components/YearSelect';
import { useSite } from '../../layouts/PublicLayout';
import { api } from '../../lib/api';

/** Selected year on public pages lives in the URL (?year=2025) so links are shareable. */
export function usePublicYear() {
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const fromUrl = Number(params.get('year')) || null;
  const year = fromUrl && site.years.includes(fromUrl) ? fromUrl : site.currentYear;
  const setYear = (y: number) => {
    const n = new URLSearchParams(params);
    n.set('year', String(y));
    setParams(n, { replace: true });
  };
  return { year, years: site.years, setYear, loading: site.isLoading };
}

export function PublicPageHeader({ title, subtitle, year, years, setYear }: { title: string; subtitle?: string; year: number | null; years: number[]; setYear: (y: number) => void }) {
  return (
    <div className="border-b border-line bg-gradient-to-b from-brand-50/70 to-transparent">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-brand-900 sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-muted">{subtitle}</p>}
        </div>
        <YearSelect years={years} value={year} onChange={setYear} />
      </div>
    </div>
  );
}

export interface PublicMedia {
  id: number;
  album_id: number;
  album_name: string;
  year: number;
  type: 'photo' | 'video';
  mime_type: string;
  width: number | null;
  height: number | null;
  description: string | null;
  allow_download: boolean;
  is_featured: boolean;
  has_thumb: boolean;
}

export interface PublicFinance {
  year: number;
  title: string;
  available: boolean;
  totals: { budget: number; contributions: number; otherIncome: number; sareeSales: number; totalIncome: number; expenses: number; sareePurchases: number; totalExpenses: number; balance: number };
  byCategory: Array<{ category: string; amount: number; count: number }>;
  contributors: { members: number; contributed: number; paid: number; partial: number; pending: number; list: Array<{ name: string; amount: number; status: 'paid' | 'partial' | 'pending' }> | null };
  expenses: Array<{ spent_on: string; category: string; description: string; amount: number }> | null;
  trend: Array<{ year: number; income: number; expenses: number; balance: number }>;
}

export const usePublicFinance = (year: number | null) =>
  useQuery({ queryKey: ['public', year, 'finance'], queryFn: async () => (await api.get<PublicFinance>(`/public/events/${year}/finance`)).data, enabled: !!year });

export const usePublicSarees = (year: number | null) =>
  useQuery({
    queryKey: ['public', year, 'sarees'],
    queryFn: async () =>
      (await api.get<{ summary: { purchased: number; sold: number; remaining: number; purchaseCost?: number; salesRevenue?: number }; sales: Array<{ sold_on: string; quantity: number; unit_price: number; total_amount: number }> | null; history: Array<{ year: number; purchased: number; sold: number; remaining: number }> }>(`/public/events/${year}/sarees`)).data,
    enabled: !!year,
  });

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-brand-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
