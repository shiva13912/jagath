import { useQuery } from '@tanstack/react-query';
import { Images } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { PublicPageHeader, usePublicYear } from './shared';

export interface PublicAlbum { id: number; name: string; description: string | null; photo_count: number; video_count: number; cover_id: number | null }

export const usePublicGallery = (year: number | null) =>
  useQuery({ queryKey: ['public', year, 'gallery'], queryFn: async () => (await api.get<{ albums: PublicAlbum[] }>(`/public/events/${year}/gallery`)).data.albums, enabled: !!year });

export default function Gallery() {
  const { year, years, setYear, loading } = usePublicYear();
  return (
    <>
      <PublicPageHeader title={year ? `Gallery ${year}` : 'Gallery'} subtitle="Photos from the celebration, album by album. Tap a photo to view or download." year={year} years={years} setYear={setYear} />
      <div className="mx-auto max-w-6xl px-4 py-8">{loading ? <Loading /> : <AlbumGrid year={year} />}</div>
    </>
  );
}

export function AlbumGrid({ year }: { year: number | null }) {
  const q = usePublicGallery(year);
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <div className="card"><EmptyState icon={<Images className="size-6" />} title="No photos published for this year yet" /></div>;
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {q.data.map((a) => (
        <li key={a.id}>
          <Link to={`/gallery/album/${a.id}`} className="group block">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-brand-100">
              {a.cover_id && <img src={`/api/media/${a.cover_id}/thumb`} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
            </div>
            <p className="mt-2 font-medium group-hover:text-brand-700">{a.name}</p>
            <p className="text-sm text-muted">{a.photo_count} photos{a.video_count > 0 && ` · ${a.video_count} videos`}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
