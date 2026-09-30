import { Camera, FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useId, useMemo } from 'react';
import { fileSize } from '../lib/format';

/**
 * Mobile-friendly file chooser for proofs and bills. Two big buttons: take a
 * photo with the camera, or pick from the gallery/files. Shows thumbnails.
 */
export function FilePicker({
  label,
  files,
  onChange,
  multiple = false,
  accept = 'image/*,application/pdf',
  hint,
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  hint?: string;
}) {
  const id = useId();
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list);
    onChange(multiple ? [...files, ...picked].slice(0, 5) : picked.slice(0, 1));
  };
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-camera`} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium shadow-sm hover:bg-stone-50">
          <Camera className="size-4 text-brand-700" /> Camera
        </label>
        <input id={`${id}-camera`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <label htmlFor={`${id}-file`} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium shadow-sm hover:bg-stone-50">
          <Paperclip className="size-4 text-brand-700" /> Choose file
        </label>
        <input id={`${id}-file`} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <FileChip key={`${f.name}-${i}`} file={f} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-stone-50 p-2">
      {url ? <img src={url} alt="" className="size-10 rounded-lg object-cover" /> : <FileText className="size-10 p-2 text-muted" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{file.name}</span>
        <span className="block text-xs text-muted">{fileSize(file.size)}</span>
      </span>
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-white" aria-label={`Remove ${file.name}`}>
        <X className="size-4" />
      </button>
    </li>
  );
}

/** Link to a private proof. The API checks the session before serving it. */
export function ProofLink({ file, label }: { file: { id: number; original_name: string; mime_type: string }; label?: string }) {
  const isImage = file.mime_type.startsWith('image/') && !file.mime_type.includes('heic') && !file.mime_type.includes('heif');
  return (
    <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-xl border border-line p-2 hover:border-brand-300">
      {isImage ? (
        <img src={`/api/files/${file.id}`} alt={file.original_name} loading="lazy" className="size-14 rounded-lg object-cover" />
      ) : (
        <FileText className="size-14 rounded-lg bg-stone-100 p-3 text-muted" />
      )}
      <span className="min-w-0">
        {label && <span className="block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>}
        <span className="block truncate text-sm group-hover:text-brand-700">{file.original_name}</span>
      </span>
    </a>
  );
}
