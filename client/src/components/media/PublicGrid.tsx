import { Play } from 'lucide-react';
import { useState } from 'react';
import type { PublicMedia } from '../../pages/public/shared';
import { Lightbox } from './Lightbox';

/** Responsive, lazy-loaded photo grid with a lightbox. */
export function PublicGrid({ items, dense }: { items: PublicMedia[]; dense?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className={`grid gap-1.5 sm:gap-2 ${dense ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
        {items.map((m, i) => (
          <li key={m.id}>
            <button onClick={() => setOpen(i)} className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-stone-100" aria-label={m.description ?? `Photo ${i + 1}`}>
              {m.has_thumb ? (
                <img src={`/api/media/${m.id}/thumb`} alt={m.description ?? ''} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <span className="flex size-full items-center justify-center bg-ink/80 text-white"><Play className="size-8" /></span>
              )}
              {m.type === 'video' && m.has_thumb && <Play className="absolute bottom-2 right-2 size-6 rounded-full bg-black/60 p-1 text-white" />}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} canDownload={(m) => !!m.allow_download} />}
    </>
  );
}
