import { CalendarDays, Images, MapPin, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Loading } from '../../components/ui';
import { inr } from '../../lib/format';
import { dateRange, usePublicEvents } from './Home';

export default function Events() {
  const events = usePublicEvents();
  return (
    <>
      <div className="border-b border-line bg-gradient-to-b from-brand-50/70 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h1 className="font-display text-3xl font-semibold text-brand-900 sm:text-4xl">Events</h1>
          <p className="mt-1 text-muted">Every year's celebration, kept permanently.</p>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {events.isLoading ? <Loading /> : !events.data?.length ? <EmptyState title="No events published yet" /> : (
          <ol className="relative space-y-6 border-l-2 border-brand-200 pl-6">
            {events.data.map((e) => (
              <li key={e.year} className="relative">
                <span className="absolute -left-[33px] top-6 size-4 rounded-full border-4 border-paper bg-brand-600" aria-hidden />
                <Link to={`/events/${e.year}`} className="card flex flex-col overflow-hidden hover:border-brand-300 sm:flex-row">
                  <div className="aspect-[16/9] bg-brand-100 sm:aspect-auto sm:w-64">
                    {e.cover_id && <img src={`/api/media/${e.cover_id}/thumb`} alt="" loading="lazy" className="size-full object-cover" />}
                  </div>
                  <div className="flex-1 p-5">
                    <p className="font-display text-3xl font-semibold text-brand-800">{e.year}</p>
                    <p className="font-medium">{e.title}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      {dateRange(e) && <span className="flex items-center gap-1"><CalendarDays className="size-4" /> {dateRange(e)}</span>}
                      {e.location && <span className="flex items-center gap-1"><MapPin className="size-4" /> {e.location}</span>}
                    </p>
                    {e.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{e.description}</p>}
                    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <span className="flex items-center gap-1"><Images className="size-4 text-muted" /> {e.photos} photos</span>
                      <span className="flex items-center gap-1"><Video className="size-4 text-muted" /> {e.videos} videos</span>
                      {e.finance && <span className="money">Collected {inr(e.finance.income)} · Spent {inr(e.finance.expenses)}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
