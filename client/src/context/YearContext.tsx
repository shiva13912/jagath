import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { EventYear } from '../lib/types';

interface YearState {
  years: EventYear[];
  year: number | null;
  event: EventYear | null;
  setYear: (y: number) => void;
  loading: boolean;
}

const YearContext = createContext<YearState | null>(null);
const STORAGE_KEY = 'dm.year';

function readStoredYear(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** The team app works on one event year at a time; this holds which one. */
export function YearProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ['events'],
    queryFn: async () => (await api.get<{ events: EventYear[] }>('/events')).data.events,
  });
  const [year, setYearState] = useState<number | null>(readStoredYear);

  const years = q.data ?? [];
  useEffect(() => {
    if (!years.length) return;
    if (!year || !years.some((e) => e.year === year)) setYearState(years[0]!.year); // newest first
  }, [years, year]);

  const value = useMemo<YearState>(
    () => ({
      years,
      year: years.some((e) => e.year === year) ? year : (years[0]?.year ?? null),
      event: years.find((e) => e.year === year) ?? years[0] ?? null,
      setYear: (y) => {
        setYearState(y);
        try {
          localStorage.setItem(STORAGE_KEY, String(y));
        } catch {
          /* private mode: fine */
        }
      },
      loading: q.isLoading,
    }),
    [years, year, q.isLoading],
  );
  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used inside YearProvider');
  return ctx;
}
