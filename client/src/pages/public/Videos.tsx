import { useQuery } from '@tanstack/react-query';
import { Download, Video } from 'lucide-react';
import { EmptyState, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { PublicPageHeader, usePublicYear, type PublicMedia } from './shared';

export const usePublicVideos = (year: number | null) =>
  useQuery({ queryKey: ['public', year, 'videos'], queryFn: async () => (await api.get<{ items: PublicMedia[] }>(`/public/events/${year}/videos`)).data.items, enabled: !!year });

export default function Videos() {
  const { year, years, setYear, loading } = usePublicYear();
  return (
    <>
      <PublicPageHeader title={year ? `Videos ${year}` : 'Videos'} subtitle="Watch the celebration again." year={year} years={years} setYear={setYear} />
      <div className="mx-auto max-w-6xl px-4 py-8">{loading ? <Loading /> : <VideoList year={year} />}</div>
    </>
  );
}

export function VideoList({ year }: { year: number | null }) {
  const q = usePublicVideos(year);
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <div className="card"><EmptyState icon={<Video className="size-6" />} title="No videos published for this year yet" /></div>;
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {q.data.map((v) => (
        <li key={v.id} className="card overflow-hidden">
          <video src={`/api/media/${v.id}/file#t=0.1`} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.description ?? v.album_name}</p>
              <p className="text-sm text-muted">{v.album_name}</p>
            </div>
            {v.allow_download && <a href={`/api/media/${v.id}/file?download=1`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-stone-50"><Download className="size-4" /> Download</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}
