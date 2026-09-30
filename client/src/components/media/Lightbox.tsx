import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface LightboxItem {
  id: number;
  type: 'photo' | 'video';
  description?: string | null;
  allow_download?: boolean;
  album_name?: string;
}

/** Full-screen viewer with keyboard and swipe-friendly big buttons. */
export function Lightbox({ items, index, onIndex, onClose, canDownload }: { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; canDownload: (i: LightboxItem) => boolean }) {
  const item = items[index];
  const prev = useCallback(() => onIndex((index - 1 + items.length) % items.length), [index, items.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % items.length), [index, items.length, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  let touchX = 0;
  if (!item) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onTouchStart={(e) => (touchX = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - touchX;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
      }}
    >
      <div className="flex items-center gap-3 p-3">
        <span className="text-sm text-white/70">{index + 1} / {items.length}{item.album_name && ` · ${item.album_name}`}</span>
        <span className="ml-auto" />
        {canDownload(item) && (
          <a href={`/api/media/${item.id}/file?download=1`} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
            <Download className="size-4" /> Download
          </a>
        )}
        <button onClick={onClose} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Close"><X className="size-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {item.type === 'photo' ? (
          <img key={item.id} src={`/api/media/${item.id}/file`} alt={item.description ?? ''} className="max-h-full max-w-full object-contain" />
        ) : (
          <video key={item.id} src={`/api/media/${item.id}/file#t=0.1`} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {items.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 rounded-full bg-white/10 p-2 hover:bg-white/25" aria-label="Previous"><ChevronLeft className="size-6" /></button>
            <button onClick={next} className="absolute right-2 rounded-full bg-white/10 p-2 hover:bg-white/25" aria-label="Next"><ChevronRight className="size-6" /></button>
          </>
        )}
      </div>
      {item.description && <p className="p-4 text-center text-sm text-white/80">{item.description}</p>}
    </div>,
    document.body,
  );
}
