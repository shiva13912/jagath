import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Listens to the server's change notifications (Server-Sent Events) and marks
 * cached data stale so every visible table, card and chart refetches.
 * Only "something changed" travels over the stream; data always comes from the
 * normal permission-checked endpoints. EventSource reconnects automatically.
 */
export function useLiveUpdates(audience: 'team' | 'public', enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const url = audience === 'team' ? '/api/stream' : '/api/public/stream';
    const source = new EventSource(url, { withCredentials: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener('change', () => {
      // Several writes often land together (e.g. an expense and its proofs): batch them.
      clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [audience, enabled, qc]);
}
