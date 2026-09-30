import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Media } from '../../lib/types';
import { EmptyState, Spinner } from '../ui';

/** Latest uploads for the selected year (team view, includes unpublished). */
export function RecentMediaStrip({ year }: { year: number }) {
  const q = useQuery({
    queryKey: ['year', year, 'media', 'recent'],
    queryFn: async () => (await api.get<{ items: Media[] }>(`/events/${year}/media?limit=12`)).data.items,
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data?.length) return <EmptyState title="No photos or videos yet" message="Upload from your phone with the + button." />;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {q.data.map((m) => (
        <li key={m.id}>
          <Link to={m.type === 'video' ? '/app/videos' : `/app/photos?album=${m.album_id}`} className="relative block aspect-square overflow-hidden rounded-xl bg-stone-100">
            {m.has_thumb ? (
              <img src={`/api/media/${m.id}/thumb`} alt={m.description ?? m.original_name} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-muted"><Play className="size-6" /></span>
            )}
            {m.type === 'video' && <Play className="absolute bottom-1.5 right-1.5 size-5 rounded-full bg-black/60 p-1 text-white" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
