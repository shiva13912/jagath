import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PublicGrid } from '../../components/media/PublicGrid';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import type { PublicMedia } from './shared';

export default function AlbumPage() {
  const { albumId } = useParams();
  const q = useQuery({
    queryKey: ['public', 'album', albumId],
    queryFn: async () => (await api.get<{ album: { id: number; name: string; description: string | null; year: number }; items: PublicMedia[] }>(`/public/albums/${albumId}`)).data,
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error, 'Album not found')} />;
  const { album, items } = q.data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to={`/gallery?year=${album.year}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="size-4" /> Gallery {album.year}</Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-brand-900">{album.name}</h1>
      {album.description && <p className="mt-1 text-muted">{album.description}</p>}
      <p className="mb-5 mt-1 text-sm text-muted">{items.length} items · {album.year}</p>
      {items.length ? <PublicGrid items={items} /> : <EmptyState title="This album is empty" />}
    </div>
  );
}
