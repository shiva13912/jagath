import { CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EmptyState, Loading } from './ui';
import { useYear } from '../context/YearContext';

/** Renders children only once an event year exists and is selected. */
export function RequireYear({ children }: { children: (year: number) => React.ReactNode }) {
  const { year, loading } = useYear();
  const { isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!year)
    return (
      <div className="card">
        <EmptyState
          icon={<CalendarPlus className="size-6" />}
          title="No event years yet"
          message={isAdmin ? 'Create the first event year to start recording contributions, expenses and photos.' : 'Ask the admin to create this year’s event.'}
          action={isAdmin && <Link to="/app/events" className="font-medium text-brand-700 hover:underline">Create an event year →</Link>}
        />
      </div>
    );
  return <>{children(year)}</>;
}
