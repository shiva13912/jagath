import { useQuery } from '@tanstack/react-query';
import { Mail, Pencil, Phone, Plus, Search, ShieldCheck, UserX } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useSave } from '../../lib/hooks';
import type { Member } from '../../lib/types';

export default function Members() {
  const { isAdmin, user } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);
  const q = useQuery({ queryKey: ['members'], queryFn: async () => (await api.get<{ members: Member[] }>('/members')).data.members });

  const deactivate = useSave((m: Member) => api.delete(`/members/${m.id}`), { success: 'Member deactivated' });
  const reactivate = useSave((m: Member) => api.put(`/members/${m.id}`, { isActive: true }), { success: 'Member reactivated' });

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((m) => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s) || (m.phone ?? '').includes(s));
  }, [q.data, search]);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={q.data ? `${q.data.filter((m) => m.is_active).length} active team members` : undefined}
        actions={
          isAdmin && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Add member
            </Button>
          )
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState title="No members found" message={search ? 'Try a different search.' : 'Add the first team member.'} />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <li key={m.id} className={`card flex gap-3 p-4 ${m.is_active ? '' : 'opacity-60'}`}>
              <Avatar name={m.name} className="size-11 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-medium">{m.name}</p>
                  {m.role === 'admin' && (
                    <Badge tone="brand">
                      <ShieldCheck className="size-3" /> Admin
                    </Badge>
                  )}
                  {!m.is_active && <Badge>Inactive</Badge>}
                  {m.id === user?.id && <Badge tone="blue">You</Badge>}
                </div>
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted">
                  <Mail className="size-3.5 shrink-0" /> {m.email}
                </p>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-muted hover:text-brand-700">
                    <Phone className="size-3.5 shrink-0" /> {m.phone}
                  </a>
                )}
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                    {m.id !== user?.id &&
                      (m.is_active ? (
                        <Button size="sm" variant="ghost" icon={<UserX className="size-3.5" />} onClick={() => setDeactivating(m)}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => reactivate.mutate(m)}>
                          Reactivate
                        </Button>
                      ))}
                    {m.last_login_at !== undefined && (
                      <span className="text-xs text-muted">Last login: {m.last_login_at ? fmtDateTime(m.last_login_at) : 'never'}</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate member?"
        message={`${deactivating?.name} will no longer be able to log in. Their contributions and expenses stay in the records. You can reactivate them later.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={() => deactivate.mutateAsync(deactivating!)}
        onClose={() => setDeactivating(null)}
      />
    </>
  );
}

function MemberForm({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: member?.role ?? 'member',
    password: '',
    notes: member?.notes ?? '',
    showOnPublicSite: member?.show_on_public_site ?? true,
    emailPublic: member?.email_public ?? false,
    phonePublic: member?.phone_public ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useSave(
    () => {
      const payload: Record<string, unknown> = { ...form };
      if (member && !form.password) delete payload.password;
      return member ? api.put(`/members/${member.id}`, payload) : api.post('/members', payload);
    },
    { success: member ? 'Member updated' : 'Member added', onSuccess: onClose, silentError: false },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    save.mutate(undefined, { onError: (err) => setErrors(fieldErrors(err)) });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? `Edit ${member.name}` : 'Add team member'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="member-form" loading={save.isPending}>
            {member ? 'Save changes' : 'Add member'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="Email (used to log in)" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Role" hint="Admins have full access, including settings and audit logs.">
          <Select value={form.role} onChange={(e) => set('role', e.target.value as 'admin' | 'member')}>
            <option value="member">Team member</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Field
          label={member ? 'Reset password' : 'Initial password'}
          required={!member}
          error={errors.password}
          hint={member ? 'Leave blank to keep the current password.' : 'At least 8 characters. Share it privately.'}
        >
          <Input type="text" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required={!member} />
        </Field>
        <div className="sm:col-span-2">
          <p className="label">Public website</p>
          <div className="divide-y divide-line rounded-xl border border-line px-3">
            <Toggle label="Show name on public site" description="Used in the public contributor list when a year enables it." checked={form.showOnPublicSite} onChange={(v) => set('showOnPublicSite', v)} />
            <Toggle label="Email is public" checked={form.emailPublic} onChange={(v) => set('emailPublic', v)} />
            <Toggle label="Phone is public" checked={form.phonePublic} onChange={(v) => set('phonePublic', v)} />
          </div>
        </div>
        <Field label="Admin notes" hint="Only admins can see these." className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
