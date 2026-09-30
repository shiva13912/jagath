import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Images, MapPin, Receipt, Shirt, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { PublicGrid } from '../../components/media/PublicGrid';
import { Loading } from '../../components/ui';
import { useSite } from '../../layouts/PublicLayout';
import { api } from '../../lib/api';
import { fmtDate, inr } from '../../lib/format';
import { Section, usePublicFinance, usePublicSarees, type PublicMedia } from './shared';

export interface PublicEventSummary {
  year: number;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  photos: number;
  videos: number;
  cover_id: number | null;
  finance: { income: number; expenses: number; balance: number } | null;
}

export const usePublicEvents = () =>
  useQuery({ queryKey: ['public', 'events'], queryFn: async () => (await api.get<{ events: PublicEventSummary[] }>('/public/events')).data.events });

export function dateRange(e: { start_date: string | null; end_date: string | null }) {
  if (!e.start_date) return null;
  return e.end_date ? `${fmtDate(e.start_date, false)} to ${fmtDate(e.end_date)}` : fmtDate(e.start_date);
}

export default function Home() {
  const site = useSite();
  const events = usePublicEvents();
  const featured = useQuery({ queryKey: ['public', 'featured'], queryFn: async () => (await api.get<{ photos: PublicMedia[]; videos: PublicMedia[] }>('/public/featured?limit=8')).data });
  const current = events.data?.[0];
  const finance = usePublicFinance(current?.year ?? null);
  const sarees = usePublicSarees(current?.year ?? null);

  if (site.isLoading || events.isLoading) return <Loading />;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        <div className="absolute inset-0 opacity-25" aria-hidden style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #f5b82e 0, transparent 35%), radial-gradient(circle at 85% 70%, #eb6834 0, transparent 40%)' }} />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:py-20 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-gold-200"><Logo className="size-5" /> Navaratri celebrations</p>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{site.data?.site_name ?? 'Durgamatha Utsav'}</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">{site.data?.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/gallery" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 font-medium text-ink hover:bg-gold-300"><Images className="size-5" /> See the photos</Link>
              <Link to="/finance" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 font-medium hover:bg-white/10"><Receipt className="size-5" /> Where the money went</Link>
            </div>
          </div>
          {current && (
            <Link to={`/events/${current.year}`} className="block rounded-2xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur hover:bg-white/15">
              <p className="text-sm uppercase tracking-wider text-gold-200">Current event</p>
              <p className="mt-1 font-display text-3xl font-semibold">{current.title}</p>
              {dateRange(current) && <p className="mt-3 flex items-center gap-2 text-white/85"><CalendarDays className="size-4" /> {dateRange(current)}</p>}
              {current.location && <p className="mt-1 flex items-center gap-2 text-white/85"><MapPin className="size-4" /> {current.location}</p>}
              {current.description && <p className="mt-3 line-clamp-3 text-sm text-white/75">{current.description}</p>}
              <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gold-200">View {current.year} <ArrowRight className="size-4" /></p>
            </Link>
          )}
        </div>
      </section>

      {/* Featured photos */}
      {featured.data && featured.data.photos.length > 0 && (
        <Section title="Featured photos" action={<Link to="/gallery" className="text-sm font-medium text-brand-700 hover:underline">Full gallery →</Link>}>
          <PublicGrid items={featured.data.photos} />
        </Section>
      )}

      {/* Finance + sarees for the current year */}
      {current && finance.data?.available && (
        <Section title={`${current.year} at a glance`} action={<Link to="/finance" className="text-sm font-medium text-brand-700 hover:underline">Full financial report →</Link>}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm text-muted">Total collected</p>
              <p className="money mt-1 text-3xl font-semibold">{inr(finance.data.totals.totalIncome)}</p>
              <p className="mt-1 text-sm text-muted">{finance.data.contributors.contributed} of {finance.data.contributors.members} members contributed</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-muted">Total spent</p>
              <p className="money mt-1 text-3xl font-semibold">{inr(finance.data.totals.totalExpenses)}</p>
              <p className="mt-1 text-sm text-muted">Top: {finance.data.byCategory.slice(0, 2).map((c) => c.category).join(', ') || '—'}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-muted">Current balance</p>
              <p className={`money mt-1 text-3xl font-semibold ${finance.data.totals.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{inr(finance.data.totals.balance)}</p>
              <p className="mt-1 text-sm text-muted">Calculated from every recorded transaction</p>
            </div>
          </div>
          {sarees.data && sarees.data.summary.purchased > 0 && (
            <Link to="/sarees" className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 p-5 hover:border-brand-300">
              <span className="flex items-center gap-2 font-medium"><Shirt className="size-5 text-brand-700" /> Sarees {current.year}</span>
              <span><span className="text-muted">Purchased</span> <strong>{sarees.data.summary.purchased}</strong></span>
              <span><span className="text-muted">Sold</span> <strong>{sarees.data.summary.sold}</strong></span>
              <span><span className="text-muted">Remaining</span> <strong className="text-brand-700">{sarees.data.summary.remaining}</strong></span>
              <ArrowRight className="ml-auto size-4 text-muted" />
            </Link>
          )}
        </Section>
      )}

      {/* Featured videos */}
      {featured.data && featured.data.videos.length > 0 && (
        <Section title="Videos" action={<Link to="/videos" className="text-sm font-medium text-brand-700 hover:underline">All videos →</Link>}>
          <div className="grid gap-4 md:grid-cols-3">
            {featured.data.videos.map((v) => (
              <figure key={v.id} className="card overflow-hidden">
                <video src={`/api/media/${v.id}/file#t=0.1`} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
                <figcaption className="p-3 text-sm"><span className="font-medium">{v.description ?? v.album_name}</span> <span className="text-muted">· {v.year}</span></figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* Year history */}
      {events.data && events.data.length > 0 && (
        <Section title="Year by year" action={<Link to="/events" className="text-sm font-medium text-brand-700 hover:underline">All years →</Link>}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.data.map((e) => (
              <li key={e.year}>
                <Link to={`/events/${e.year}`} className="card group block overflow-hidden hover:border-brand-300">
                  <div className="relative aspect-[16/9] bg-brand-100">
                    {e.cover_id && <img src={`/api/media/${e.cover_id}/thumb`} alt="" loading="lazy" className="size-full object-cover" />}
                    <span className="absolute bottom-2 left-3 font-display text-4xl font-bold text-white drop-shadow-lg">{e.year}</span>
                  </div>
                  <div className="flex items-center gap-4 p-4 text-sm text-muted">
                    <span className="flex items-center gap-1"><Images className="size-4" /> {e.photos}</span>
                    <span className="flex items-center gap-1"><Video className="size-4" /> {e.videos}</span>
                    {e.finance && <span className="money ml-auto">Spent {inr(e.finance.expenses)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {site.data?.about && (
        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-4 py-12 text-center">
            <h2 className="font-display text-2xl font-semibold text-brand-900">About us</h2>
            <p className="mt-3 whitespace-pre-line text-muted">{site.data.about}</p>
          </div>
        </section>
      )}
    </>
  );
}
