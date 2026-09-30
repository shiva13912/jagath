import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { YearSelect } from '../../components/YearSelect';
import { ErrorState, Loading } from '../../components/ui';
import { useSite } from '../../layouts/PublicLayout';
import { api, errorMessage } from '../../lib/api';
import { FinanceReport } from './Finance';
import { AlbumGrid } from './Gallery';
import { dateRange } from './Home';
import { SareeReport } from './Sarees';
import { Section, usePublicFinance } from './shared';
import { VideoList } from './Videos';

export default function EventYearPage() {
  const { year: raw } = useParams();
  const year = Number(raw);
  const site = useSite();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['public', year, 'event'],
    queryFn: async () => (await api.get<{ event: { year: number; title: string; description: string | null; location: string | null; start_date: string | null; end_date: string | null }; counts: { photos: number; videos: number } }>(`/public/events/${year}`)).data,
  });
  const finance = usePublicFinance(q.data ? year : null);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error, 'Event not found')} />;
  const e = q.data.event;

  return (
    <>
      <div className="bg-brand-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-6xl font-bold text-gold-300">{e.year}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">{e.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-4 text-white/85">
              {dateRange(e) && <span className="flex items-center gap-1"><CalendarDays className="size-4" /> {dateRange(e)}</span>}
              {e.location && <span className="flex items-center gap-1"><MapPin className="size-4" /> {e.location}</span>}
            </p>
            {e.description && <p className="mt-3 max-w-2xl text-white/80">{e.description}</p>}
          </div>
          <div className="text-ink"><YearSelect years={site.years} value={year} onChange={(y) => navigate(`/events/${y}`)} /></div>
        </div>
      </div>
      <nav className="sticky top-16 z-20 border-b border-line bg-paper/95 backdrop-blur" aria-label="Sections">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 text-sm">
          {[['#photos', `Photos (${q.data.counts.photos})`], ['#videos', `Videos (${q.data.counts.videos})`], ['#finance', 'Finance'], ['#sarees', 'Sarees']].map(([href, label]) => (
            <a key={href} href={href} className="whitespace-nowrap px-3 py-3 font-medium text-ink/75 hover:text-brand-700">{label}</a>
          ))}
        </div>
      </nav>
      <div id="photos" className="scroll-mt-28"><Section title="Photos" action={<Link to={`/gallery?year=${year}`} className="text-sm font-medium text-brand-700 hover:underline">Open gallery →</Link>}><AlbumGrid year={year} /></Section></div>
      <div id="videos" className="scroll-mt-28"><Section title="Videos"><VideoList year={year} /></Section></div>
      <div id="finance" className="scroll-mt-28">{finance.data && <FinanceReport data={finance.data} compact />}</div>
      <div id="sarees" className="scroll-mt-28"><SareeReport year={year} compact /></div>
    </>
  );
}
