import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { LogIn, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useLiveUpdates } from '../lib/realtime';

export interface SiteInfo {
  site_name: string;
  tagline: string;
  about: string;
  contact: string;
}

export function useSite() {
  const q = useQuery({
    queryKey: ['public', 'site'],
    queryFn: async () => (await api.get<{ site: SiteInfo; years: number[]; currentYear: number | null }>('/public/site')).data,
    staleTime: 60 * 1000,
  });
  return { ...q, data: q.data?.site, years: q.data?.years ?? [], currentYear: q.data?.currentYear ?? null };
}

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/events', label: 'Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/videos', label: 'Videos' },
  { to: '/finance', label: 'Finance' },
  { to: '/sarees', label: 'Saree History' },
  { to: '/about', label: 'About' },
];

export function PublicLayout() {
  const site = useSite();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useLiveUpdates('public');
  const name = site.data?.site_name ?? 'Durgamatha Utsav';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <Logo className="size-9" />
            <span className="font-display text-lg font-semibold text-brand-800">{name}</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  clsx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'text-brand-700' : 'text-ink/75 hover:text-ink')
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <Link
            to={user ? '/app' : '/login'}
            className="ml-auto hidden items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 sm:inline-flex lg:ml-2"
          >
            <LogIn className="size-4" /> {user ? 'Team workspace' : 'Team login'}
          </Link>
          <button className="ml-auto rounded-lg p-2 hover:bg-stone-100 sm:ml-0 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-line bg-white px-4 py-2 lg:hidden" aria-label="Main mobile">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => clsx('block rounded-lg px-3 py-2.5 font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-ink/80')}
              >
                {l.label}
              </NavLink>
            ))}
            <Link to={user ? '/app' : '/login'} onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2.5 font-medium text-brand-700">
              {user ? 'Team workspace →' : 'Team login →'}
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span>{name}</span>
          </div>
          <p>Every rupee recorded. Every memory kept.</p>
        </div>
      </footer>
    </div>
  );
}
