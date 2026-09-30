import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus, UploadCloud, Video, X } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { fileSize } from '../../lib/format';
import type { Album } from '../../lib/types';
import { Button, Field, Input, Modal, Select } from '../ui';

const MAX_BATCH_BYTES = 40 * 1024 * 1024;

/**
 * Upload photos or videos into an album. Built for phones: one tap opens the
 * camera roll with multi-select; files go up in small batches with a progress
 * bar, so a flaky connection only retries a batch, not everything.
 */
export function UploadDialog({
  year,
  kind,
  albums,
  defaultAlbumId,
  onClose,
}: {
  year: number;
  kind: 'photo' | 'video';
  albums: Album[];
  defaultAlbumId?: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [albumId, setAlbumId] = useState<string>(defaultAlbumId ? String(defaultAlbumId) : albums[0] ? String(albums[0].id) : 'new');
  const [newAlbum, setNewAlbum] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; pct: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const accept = kind === 'photo' ? 'image/jpeg,image/png,image/webp,image/gif,image/avif' : 'video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp';

  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => (kind === 'photo' ? f.type.startsWith('image/') : f.type.startsWith('video/')));
    if (picked.length < (list as File[]).length) toast.warning(`Only ${kind}s can be added here`);
    setFiles((prev) => [...prev, ...picked].slice(0, 100));
  };

  async function upload() {
    let targetId = albumId;
    try {
      if (albumId === 'new') {
        if (!newAlbum.trim()) return toast.error('Name the new album');
        const res = await api.post(`/events/${year}/albums`, { name: newAlbum.trim() });
        targetId = String(res.data.album.id);
      }
      // Group into batches by size so each request stays small on mobile data.
      const batches: File[][] = [];
      let current: File[] = [];
      let bytes = 0;
      for (const f of files) {
        if (current.length && (bytes + f.size > MAX_BATCH_BYTES || current.length >= 10)) {
          batches.push(current);
          current = [];
          bytes = 0;
        }
        current.push(f);
        bytes += f.size;
      }
      if (current.length) batches.push(current);

      const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
      let sentBytes = 0;
      let done = 0;
      let published = true;
      setProgress({ done: 0, total: files.length, pct: 0 });
      for (const batch of batches) {
        const fd = new FormData();
        batch.forEach((f) => fd.append('files', f));
        if (description) fd.append('description', description);
        const batchBytes = batch.reduce((s, f) => s + f.size, 0);
        const res = await api.post(`/albums/${targetId}/media`, fd, {
          onUploadProgress: (e) => setProgress({ done, total: files.length, pct: Math.round(((sentBytes + (e.loaded / (e.total || batchBytes)) * batchBytes) / totalBytes) * 100) }),
        });
        published = published && res.data.published;
        sentBytes += batchBytes;
        done += batch.length;
        setProgress({ done, total: files.length, pct: Math.round((sentBytes / totalBytes) * 100) });
      }
      toast.success(`${files.length} ${kind}${files.length > 1 ? 's' : ''} uploaded${published ? '' : '. They will appear publicly once an admin approves them.'}`);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setProgress(null);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    }
  }

  const busy = !!progress;
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={kind === 'photo' ? `Upload photos · ${year}` : `Upload video · ${year}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="lg" icon={<UploadCloud className="size-5" />} onClick={upload} loading={busy} disabled={!files.length}>
            {busy ? `Uploading ${progress!.pct}%` : `Upload ${files.length || ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Album" required>
            <Select value={albumId} onChange={(e) => setAlbumId(e.target.value)} disabled={busy}>
              {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="new">+ New album…</option>
            </Select>
          </Field>
          {albumId === 'new' ? (
            <Field label="New album name" required><Input value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} placeholder="e.g. Procession" disabled={busy} /></Field>
          ) : (
            <Field label="Caption (optional)"><Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} /></Field>
          )}
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${drag ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-300 hover:bg-stone-50'} ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          {kind === 'photo' ? <ImagePlus className="size-9 text-brand-600" /> : <Video className="size-9 text-brand-600" />}
          <span className="font-medium">Tap to choose {kind === 'photo' ? 'photos' : 'videos'}</span>
          <span className="hidden text-sm text-muted sm:block">or drag and drop them here</span>
          <span className="text-xs text-muted">{kind === 'photo' ? 'JPG, PNG, WebP · up to 15 MB each · select many at once' : 'MP4, MOV, WebM · up to 500 MB'}</span>
          <input type="file" accept={accept} multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} disabled={busy} />
        </label>

        {progress && (
          <div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="mt-1 text-sm text-muted">{progress.done} of {progress.total} done. Keep this screen open.</p>
          </div>
        )}

        {files.length > 0 && (
          <>
            <p className="text-sm text-muted">{files.length} selected · {fileSize(files.reduce((s, f) => s + f.size, 0))}</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                  {previews[i] ? <img src={previews[i]!} alt="" className="size-full object-cover" /> : <span className="flex size-full flex-col items-center justify-center p-1 text-center text-[10px] text-muted"><Video className="mb-1 size-5" />{f.name}</span>}
                  {progress && i < progress.done && <CheckCircle2 className="absolute right-1 top-1 size-5 rounded-full bg-white text-emerald-600" />}
                  {!busy && (
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" aria-label={`Remove ${f.name}`}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {!isAdmin && <p className="text-xs text-muted">Uploads from team members appear on the public site after an admin approves them.</p>}
      </div>
    </Modal>
  );
}
