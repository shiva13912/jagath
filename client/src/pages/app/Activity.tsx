import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock, Search } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Select } from '../../components/ui';
import { useYear } from '../../context/YearContext';
import { api, errorMessage } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { useMembers } from '../../lib/queries';
import type { ActivityItem } from '../../lib/types';

const ENTITIES = ['expense', 'contribution', 'other_income', 'budget', 'roster', 'saree_purchase', 'saree_sale', 'album', 'media', 'event', 'user', 'category', 'settings'];
const ACTION_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray' | 'blue'> = { create: 'green', upload: 'green', update: 'amber', delete: 'red', deactivate: 'red', login: 'gray', publish: 'blue' };

export default function Activity() {
  const { years } = useYear();
  const members = useMembers();
  const [year, setYear] = useState('');
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const search = useDebounced(q);
  useEffect(() => setPage(1), [year, entity, userId, search]);

  const list = useQuery({
    queryKey: ['activity', { year, entity, userId, search, page }],
    queryFn: async () =>
      (await api.get<{ items: ActivityItem[]; total: number; pageSize: number }>('/activity', { params: { year: year || undefined, entity: entity || undefined, userId: userId || undefined, q: search || undefined, page, pageSize: 30 } })).data,
    placeholderData: keepPreviousData,
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Activity log" subtitle={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" /> Append-only. Entries cannot be edited or deleted, not even by admins.</span>} />
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" />
        </div>
        <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="">All years</option>{years.map((y) => <option key={y.year} value={y.year}>{y.year}</option>)}</Select>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Record type"><option value="">All record types</option>{ENTITIES.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}</Select>
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person"><option value="">Everyone</option>{members.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      </div>
      <Card bodyClassName="p-0">
        {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={errorMessage(list.error)} /> : !list.data?.items.length ? <EmptyState title="No activity matches" /> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What happened</th><th className="hidden lg:table-cell">Year</th></tr></thead>
              <tbody>
                {list.data.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr className={a.details ? 'cursor-pointer hover:bg-stone-50' : ''} onClick={() => a.details && setOpen(open === a.id ? null : a.id)}>
                      <td className="whitespace-nowrap text-muted">{fmtDateTime(a.created_at)}</td>
                      <td className="whitespace-nowrap">{a.user_name ?? 'System'}</td>
                      <td><Badge tone={ACTION_TONE[a.action] ?? 'gray'}>{a.action}</Badge></td>
                      <td>{a.summary}{a.details && <span className="ml-1 text-xs text-brand-700">{open === a.id ? 'hide' : 'details'}</span>}</td>
                      <td className="hidden text-muted lg:table-cell">{a.year ?? '—'}</td>
                    </tr>
                    {open === a.id && a.details && (
                      <tr><td colSpan={5} className="bg-stone-50">
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(a.details, null, 2)}</pre>
                        {a.ip && <p className="mt-1 text-xs text-muted">IP {a.ip}</p>}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-4" />}>Prev</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="size-4" /></Button>
        </div>
      )}
    </>
  );
}
