import clsx from 'clsx';
import {
  Activity,
  Camera,
  CalendarRange,
  Globe,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  Shirt,
  UserCircle,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { QuickActions } from '../components/QuickActions';
import { YearSelect } from '../components/YearSelect';
import { Avatar, EmptyState, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { YearProvider, useYear } from '../context/YearContext';
import { useLiveUpdates } from '../lib/realtime';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/members', label: 'Members', icon: Users },
  { to: '/app/contributions', label: 'Contributions', icon: HandCoins },
  { to: '/app/expenses', label: 'Expenses', icon: Receipt },
  { to: '/app/budget', label: 'Budget', icon: PiggyBank },
  { to: '/app/sarees', label: 'Sarees', icon: Shirt },
  { to: '/app/photos', label: 'Photos', icon: Camera },
  { to: '/app/videos', label: 'Videos', icon: Video },
  { to: '/app/events', label: 'Events / Years', icon: CalendarRange, adminOnly: true },
  { to: '/app/activity', label: 'Activity Logs', icon: Activity, adminOnly: true },
  { to: '/app/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

/** Hides admin screens from team members (the API refuses them anyway). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <div className="card"><EmptyState title="Admins only" message="This page is only available to admins." /></div>;
  return <>{children}</>;
}

/** Guards the whole /app area. The API enforces permissions too; this is only UX. */
export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <YearProvider>
      <Shell />
    </YearProvider>
  );
}

function Shell() {
  const { user, isAdmin, logout } = useAuth();
  const { years, year, setYear } = useYear();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [quick, setQuick] = useState(false);
  useLiveUpdates('team');

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link to="/app" className="flex items-center gap-2.5 px-5 py-5" onClick={() => setDrawer(false)}>
        <Logo />
        <span>
          <span className="block font-display text-lg font-semibold leading-tight text-brand-800">Durgamatha</span>
          <span className="block text-xs text-muted">Team workspace</span>
        </span>
      </Link>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={() => setDrawer(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-700 text-white' : 'text-ink/80 hover:bg-stone-100',
                )
              }
            >
              <Icon className="size-4.5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="space-y-0.5 border-t border-line p-3">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-stone-100" onClick={() => setDrawer(false)}>
          <Globe className="size-4.5" /> Public website
        </Link>
        <NavLink
          to="/app/profile"
          onClick={() => setDrawer(false)}
          className={({ isActive }) =>
            clsx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', isActive ? 'bg-stone-100 font-medium' : 'text-muted hover:bg-stone-100')
          }
        >
          <UserCircle className="size-4.5" /> My profile
        </NavLink>
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-stone-100"
        >
          <LogOut className="size-4.5" /> Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-5 rounded-lg p-1.5 hover:bg-stone-100" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:px-8">
        <button className="-ml-1 rounded-lg p-1.5 hover:bg-stone-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <Link to="/app" className="flex items-center gap-2 lg:hidden">
          <Logo className="size-7" />
        </Link>
        <YearSelect years={years.map((e) => e.year)} value={year} onChange={setYear} />
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setQuick(true)}
            className="hidden items-center gap-1.5 rounded-xl bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 sm:inline-flex"
          >
            <Plus className="size-4" /> Add
          </button>
          <Link to="/app/profile" className="flex items-center gap-2">
            <Avatar name={user!.name} />
            <span className="hidden text-sm md:block">
              <span className="block font-medium leading-tight">{user!.name}</span>
              <span className="block text-xs capitalize text-muted">{user!.role === 'member' ? 'Team member' : 'Admin'}</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom bar: the actions people do most from their phones */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-safe lg:hidden" aria-label="Quick">
        {[
          { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
          { to: '/app/expenses', label: 'Expenses', icon: Receipt },
        ].map(({ to, label, icon: Icon, end }) => (
          <BottomLink key={to} to={to} label={label} Icon={Icon} end={end} />
        ))}
        <button onClick={() => setQuick(true)} className="flex flex-col items-center justify-center" aria-label="Add">
          <span className="-mt-6 flex size-13 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg ring-4 ring-paper">
            <Plus className="size-6" />
          </span>
        </button>
        <BottomLink to="/app/photos" label="Photos" Icon={Camera} />
        <BottomLink to="/app/contributions" label="Pay" Icon={HandCoins} />
      </nav>

      <QuickActions open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

function BottomLink({ to, label, Icon, end }: { to: string; label: string; Icon: ComponentType<{ className?: string }>; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  );
}
