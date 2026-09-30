import { useQuery } from '@tanstack/react-query';
import { Download, Eye, EyeOff, Star, Trash2, Upload, Video } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UploadDialog } from '../../components/media/UploadDialog';
import { RequireYear } from '../../components/NoYear';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, Select } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { fileSize, fmtDate } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import type { Media } from '../../lib/types';
import { useAlbums } from './Photos';

export default function Videos() {
  return <RequireYear>{(year) => <VideosFor year={year} />}</RequireYear>;
}

function VideosFor({ year }: { year: number }) {
  const { user, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [album, setAlbum] = useState('');
  const [deleting, setDeleting] = useState<Media | null>(null);
  const albums = useAlbums(year);
  const q = useQuery({ queryKey: ['year', year, 'media', 'videos'], queryFn: async () => (await api.get<{ items: Media[] }>(`/events/${year}/media?type=video&limit=500`)).data.items });
  const update = useSave(({ id, body }: { id: number; body: Record<string, unknown> }) => api.put(`/media/${id}`, body), { success: 'Saved' });
  const del = useSave((m: Media) => api.delete(`/media/${m.id}`), { success: 'Video deleted' });
  const uploading = params.get('upload') === '1';
  const items = (q.data ?? []).filter((v) => !album || v.album_id === Number(album));

  return (
    <>
      <PageHeader
        title={`Videos ${year}`}
        subtitle="Stored in cloud storage, never in the database. Private until published."
        actions={<Button icon={<Upload className="size-4" />} onClick={() => setParams({ upload: '1' })} disabled={!albums.data}>Upload video</Button>}
      />
      {albums.data && albums.data.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select value={album} onChange={(e) => setAlbum(e.target.value)} aria-label="Album">
            <option value="">All albums</option>
            {albums.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
      )}
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={errorMessage(q.error)} /> : items.length === 0 ? (
        <div className="card"><EmptyState icon={<Video className="size-6" />} title="No videos yet" message="Upload short clips straight from your phone." action={<Button onClick={() => setParams({ upload: '1' })}>Upload video</Button>} /></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((v) => (
            <li key={v.id} className="card overflow-hidden">
              <video src={`/api/media/${v.id}/file#t=0.1`} controls preload="metadata" playsInline className="aspect-video w-full bg-black" />
              <div className="p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate font-medium">{v.description || v.original_name}</p>
                  {v.is_public ? <Badge tone="green">Public</Badge> : <Badge tone="amber">Pending</Badge>}
                  {v.is_featured && <Badge tone="brand">Featured</Badge>}
                </div>
                <p className="text-xs text-muted">{v.album_name} · {v.uploaded_by_name} · {fmtDate(v.created_at.slice(0, 10))} · {fileSize(v.size_bytes)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href={`/api/media/${v.id}/file?download=1`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-stone-100"><Download className="size-3.5" /> Download</a>
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="ghost" icon={v.is_public ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} onClick={() => update.mutate({ id: v.id, body: { isPublic: !v.is_public } })}>{v.is_public ? 'Hide' : 'Publish'}</Button>
                      <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => update.mutate({ id: v.id, body: { isFeatured: !v.is_featured } })}>{v.is_featured ? 'Unfeature' : 'Feature'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: v.id, body: { allowDownload: !v.allow_download } })}>{v.allow_download ? 'Public download on' : 'Public download off'}</Button>
                    </>
                  )}
                  {(isAdmin || v.uploaded_by === user!.id) && <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(v)} aria-label="Delete" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {uploading && albums.data && <UploadDialog year={year} kind="video" albums={albums.data} onClose={() => setParams({})} />}
      <ConfirmDialog open={!!deleting} title="Delete video?" message={`"${deleting?.description || deleting?.original_name}" will be removed.`} danger confirmLabel="Delete" onConfirm={() => del.mutateAsync(deleting!)} onClose={() => setDeleting(null)} />
    </>
  );
}
