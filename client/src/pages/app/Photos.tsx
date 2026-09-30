import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckSquare, Eye, EyeOff, FolderPlus, Globe, ImagePlus, Lock, Pencil, Star, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lightbox } from '../../components/media/Lightbox';
import { UploadDialog } from '../../components/media/UploadDialog';
import { RequireYear } from '../../components/NoYear';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Textarea, Toggle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { useSave } from '../../lib/hooks';
import type { Album, Media } from '../../lib/types';

export default function Photos() {
  return <RequireYear>{(year) => <PhotosFor year={year} />}</RequireYear>;
}

export function useAlbums(year: number) {
  return useQuery({ queryKey: ['year', year, 'albums'], queryFn: async () => (await api.get<{ albums: Album[] }>(`/events/${year}/albums`)).data.albums });
}

function PhotosFor({ year }: { year: number }) {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const albumId = Number(params.get('album')) || null;
  const uploading = params.get('upload') === '1';
  const albums = useAlbums(year);
  const [albumForm, setAlbumForm] = useState<Album | 'new' | null>(null);

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v === null) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: k === 'upload' });
  };

  if (albums.isLoading) return <Loading />;
  if (albums.isError) return <ErrorState message={errorMessage(albums.error)} onRetry={() => albums.refetch()} />;
  const list = albums.data ?? [];

  return (
    <>
      {albumId ? (
        <AlbumView albumId={albumId} onBack={() => setParam('album', null)} onUpload={() => setParam('upload', '1')} onEdit={(a) => setAlbumForm(a)} />
      ) : (
        <>
          <PageHeader
            title={`Photos ${year}`}
            subtitle="Organised by album. Private until published."
            actions={
              <>
                <Button variant="secondary" icon={<FolderPlus className="size-4" />} onClick={() => setAlbumForm('new')}>New album</Button>
                <Button icon={<ImagePlus className="size-4" />} onClick={() => setParam('upload', '1')}>Upload photos</Button>
              </>
            }
          />
          {list.length === 0 ? (
            <div className="card"><EmptyState title="No albums yet" message="Create albums like Preparation, Decoration, Main Event, Procession." action={<Button onClick={() => setAlbumForm('new')}>Create album</Button>} /></div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((a) => (
                <li key={a.id}>
                  <button onClick={() => setParam('album', String(a.id))} className="card group block w-full overflow-hidden text-left">
                    <div className="aspect-[4/3] bg-stone-100">
                      {a.cover_id ? <img src={`/api/media/${a.cover_id}/thumb`} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" /> : <span className="flex size-full items-center justify-center text-muted"><ImagePlus className="size-8" /></span>}
                    </div>
                    <div className="p-3">
                      <p className="flex items-center gap-1.5 font-medium">{!a.is_public && <Lock className="size-3.5 text-muted" aria-label="Private album" />}{a.name}</p>
                      <p className="text-xs text-muted">{a.photo_count} photos{a.video_count > 0 && ` · ${a.video_count} videos`}</p>
                      {isAdmin && (a.pending_count ?? 0) > 0 && <Badge tone="amber" className="mt-1.5">{a.pending_count} awaiting approval</Badge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {uploading && <UploadDialog year={year} kind="photo" albums={list} defaultAlbumId={albumId} onClose={() => setParam('upload', null)} />}
      {albumForm && <AlbumForm year={year} album={albumForm === 'new' ? null : albumForm} onClose={() => setAlbumForm(null)} onDeleted={() => setParam('album', null)} />}
    </>
  );
}

function AlbumView({ albumId, onBack, onUpload, onEdit }: { albumId: number; onBack: () => void; onUpload: () => void; onEdit: (a: Album) => void }) {
  const { user, isAdmin } = useAuth();
  const q = useQuery({ queryKey: ['album', albumId, 'media'], queryFn: async () => (await api.get<{ album: Album; items: Media[] }>(`/albums/${albumId}/media?type=photo`)).data });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bulk = useSave((action: string) => api.post('/media/bulk', { ids: [...selected], action }), { success: 'Done', onSuccess: () => { setSelected(new Set()); setSelecting(false); } });
  const delOne = useSave((id: number) => api.delete(`/media/${id}`), { success: 'Photo deleted', onSuccess: () => setViewer(null) });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} />;
  const { album, items } = q.data;
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canManage = isAdmin || album.created_by === user!.id;

  return (
    <>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="size-4" /> All albums</button>
      <PageHeader
        title={<span className="flex items-center gap-2">{album.name} {album.is_public ? <Badge tone="green"><Globe className="size-3" /> Public album</Badge> : <Badge><Lock className="size-3" /> Private album</Badge>}</span>}
        subtitle={album.description ?? `${items.length} photos`}
        actions={
          <>
            {canManage && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => onEdit(album)}>Edit album</Button>}
            {isAdmin && items.length > 0 && <Button variant={selecting ? 'primary' : 'secondary'} icon={<CheckSquare className="size-4" />} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>{selecting ? 'Done' : 'Select'}</Button>}
            <Button icon={<Upload className="size-4" />} onClick={onUpload}>Upload</Button>
          </>
        }
      />
      {selecting && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2 shadow-sm">
          <span className="px-2 text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(items.filter((i) => !i.is_public).map((i) => i.id)))}>Select pending</Button>
          <span className="ml-auto" />
          <Button size="sm" icon={<Eye className="size-3.5" />} disabled={!selected.size} onClick={() => bulk.mutate('publish')}>Publish</Button>
          <Button size="sm" variant="secondary" icon={<EyeOff className="size-3.5" />} disabled={!selected.size} onClick={() => bulk.mutate('unpublish')}>Hide</Button>
          <Button size="sm" variant="secondary" icon={<Star className="size-3.5" />} disabled={!selected.size} onClick={() => bulk.mutate('feature')}>Feature</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={!selected.size} onClick={() => setConfirmDelete(true)}>Delete</Button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="card"><EmptyState title="No photos in this album yet" action={<Button onClick={onUpload}>Upload photos</Button>} /></div>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
          {items.map((m, i) => (
            <li key={m.id} className="relative">
              <button
                onClick={() => (selecting ? toggle(m.id) : setViewer(i))}
                className={`block aspect-square w-full overflow-hidden rounded-lg bg-stone-100 ${selected.has(m.id) ? 'ring-4 ring-brand-600' : ''}`}
                aria-label={m.description ?? m.original_name}
              >
                <img src={`/api/media/${m.id}/thumb`} alt={m.description ?? ''} loading="lazy" className={`size-full object-cover ${!m.is_public ? 'opacity-80' : ''}`} />
              </button>
              <span className="pointer-events-none absolute left-1 top-1 flex gap-1">
                {!m.is_public && <Badge tone="amber" className="text-[10px]">Pending</Badge>}
                {m.is_featured && <Star className="size-4 fill-gold-400 text-gold-500 drop-shadow" />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {viewer !== null && items[viewer] && (
        <>
          <Lightbox items={items.map((m) => ({ ...m, album_name: album.name }))} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} canDownload={() => true} />
          <MediaAdminBar media={items[viewer]} canDelete={isAdmin || items[viewer].uploaded_by === user!.id} onDelete={() => delOne.mutate(items[viewer].id)} />
        </>
      )}
      <ConfirmDialog open={confirmDelete} title={`Delete ${selected.size} photo(s)?`} message="They will be removed from the gallery." danger confirmLabel="Delete" onConfirm={() => bulk.mutateAsync('delete')} onClose={() => setConfirmDelete(false)} />
    </>
  );
}

/** Controls shown over the lightbox for team members. */
export function MediaAdminBar({ media, canDelete, onDelete }: { media: Media; canDelete: boolean; onDelete: () => void }) {
  const { isAdmin } = useAuth();
  const update = useSave((body: Record<string, unknown>) => api.put(`/media/${media.id}`, body), { success: 'Saved' });
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-2 bg-black/80 p-3 pb-safe text-sm text-white">
      <span className="text-white/70">By {media.uploaded_by_name}</span>
      {isAdmin && (
        <>
          <button className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" onClick={() => update.mutate({ isPublic: !media.is_public })}>{media.is_public ? 'Hide from public' : 'Publish'}</button>
          <button className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" onClick={() => update.mutate({ isFeatured: !media.is_featured })}>{media.is_featured ? 'Unfeature' : 'Feature on home'}</button>
          <button className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" onClick={() => update.mutate({ allowDownload: !media.allow_download })}>{media.allow_download ? 'Disable public download' : 'Allow public download'}</button>
        </>
      )}
      {canDelete && <button className="rounded-lg bg-red-600 px-3 py-1.5 hover:bg-red-700" onClick={onDelete}>Delete</button>}
    </div>
  );
}

function AlbumForm({ year, album, onClose, onDeleted }: { year: number; album: Album | null; onClose: () => void; onDeleted: () => void }) {
  const { isAdmin } = useAuth();
  const [name, setName] = useState(album?.name ?? '');
  const [description, setDescription] = useState(album?.description ?? '');
  const [isPublic, setIsPublic] = useState(album?.is_public ?? true);
  const [confirm, setConfirm] = useState(false);
  const save = useSave(
    () => (album ? api.put(`/albums/${album.id}`, { name, description, ...(isAdmin ? { isPublic } : {}) }) : api.post(`/events/${year}/albums`, { name, description })),
    { success: 'Album saved', onSuccess: onClose },
  );
  const del = useSave(() => api.delete(`/albums/${album!.id}`), { success: 'Album deleted', onSuccess: () => { onClose(); onDeleted(); } });
  return (
    <Modal open onClose={onClose} title={album ? 'Edit album' : `New album · ${year}`} footer={
      <>
        {album && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => setConfirm(true)}>Delete album</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!name.trim()}>Save</Button>
      </>
    }>
      <div className="space-y-4">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Event" autoFocus /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
        {isAdmin && album && <div className="rounded-xl border border-line px-3"><Toggle label="Public album" description="Published photos in this album appear on the public gallery." checked={isPublic} onChange={setIsPublic} /></div>}
      </div>
      <ConfirmDialog open={confirm} title="Delete this album?" message="All photos and videos in it will be removed from the gallery." danger confirmLabel="Delete album" onConfirm={() => del.mutateAsync(undefined)} onClose={() => setConfirm(false)} />
    </Modal>
  );
}
