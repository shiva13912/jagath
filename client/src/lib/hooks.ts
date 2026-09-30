import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from './api';

/**
 * Wraps a write request: shows a toast, and on success marks all cached data
 * stale so dashboards, tables and charts refetch the server's new totals.
 */
export function useSave<TVars, TResult = any>(
  fn: (vars: TVars) => Promise<TResult> | Promise<any>,
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      opts.onSuccess?.(result);
    },
    onError: (err) => {
      if (!opts.silentError) toast.error(errorMessage(err));
    },
  });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
