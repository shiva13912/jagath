import { useQuery } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui';
import { useSite } from '../../layouts/PublicLayout';
import { api } from '../../lib/api';

export default function About() {
  const site = useSite();
  const team = useQuery({ queryKey: ['public', 'team'], queryFn: async () => (await api.get<{ team: Array<{ name: string; email: string | null; phone: string | null }> }>('/public/team')).data.team });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold text-brand-900 sm:text-4xl">About {site.data?.site_name}</h1>
      <p className="mt-4 whitespace-pre-line text-lg text-ink/85">{site.data?.about}</p>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-brand-900">How we keep things transparent</h2>
        <ul className="mt-3 space-y-2 text-ink/85">
          <li>• Every contribution and expense is recorded with proof by the team member who made it.</li>
          <li>• Totals and balances are calculated automatically from those records. Nobody types them in by hand.</li>
          <li>• Every change is kept in a permanent activity log that cannot be edited.</li>
          <li>• The <Link to="/finance" className="text-brand-700 underline">finance page</Link> shows the same numbers the team sees, updated live.</li>
        </ul>
      </section>

      {team.data && team.data.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-brand-900">Organising team</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {team.data.map((m) => (
              <li key={m.name} className="card flex items-center gap-3 p-3">
                <Avatar name={m.name} className="size-10" />
                <div className="min-w-0">
                  <p className="font-medium">{m.name}</p>
                  {m.email && <a href={`mailto:${m.email}`} className="flex items-center gap-1 text-sm text-muted hover:text-brand-700"><Mail className="size-3.5" /> {m.email}</a>}
                  {m.phone && <a href={`tel:${m.phone}`} className="flex items-center gap-1 text-sm text-muted hover:text-brand-700"><Phone className="size-3.5" /> {m.phone}</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {site.data?.contact && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold text-brand-900">Contact</h2>
          <p className="mt-2 whitespace-pre-line">{site.data.contact}</p>
        </section>
      )}
    </div>
  );
}
