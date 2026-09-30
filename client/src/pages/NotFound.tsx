import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Page not found"
        message="The page you are looking for does not exist or was moved."
        action={
          <Link to={inApp ? '/app' : '/'} className="font-medium text-brand-700 hover:underline">
            Go to {inApp ? 'dashboard' : 'home'}
          </Link>
        }
      />
    </div>
  );
}
