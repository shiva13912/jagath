import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Textarea, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { useSave } from '../../lib/hooks';
import { useCategories } from '../../lib/queries';

interface SettingsData { site_name: string; tagline: string; about: string; contact: string; auto_publish_member_uploads: boolean }

export default function Settings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get<{ settings: SettingsData }>('/settings')).data.settings });
  const [form, setForm] = useState<SettingsData | null>(null);
  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);
  const save = useSave(() => api.put('/settings', form), { success: 'Settings saved' });
  const categories = useCategories();
  const [newCat, setNewCat] = useState('');
  const addCat = useSave(() => api.post('/expense-categories', { name: newCat }), { success: 'Category added', onSuccess: () => setNewCat('') });
  const toggleCat = useSave((c: { id: number; is_active: boolean }) => api.put(`/expense-categories/${c.id}`, { isActive: !c.is_active }), { success: 'Category updated' });

  if (!form) return <Loading />;
  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => setForm({ ...form, [k]: v });

  return (
    <>
      <PageHeader title="Settings" subtitle="Only admins can see this page." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Public website">
          <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(undefined); }}>
            <Field label="Site name"><Input value={form.site_name} onChange={(e) => set('site_name', e.target.value)} /></Field>
            <Field label="Tagline"><Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
            <Field label="About text" hint="Shown on the home and About pages."><Textarea rows={6} value={form.about} onChange={(e) => set('about', e.target.value)} /></Field>
            <Field label="Contact" hint="Optional. Shown publicly on the About page."><Textarea rows={2} value={form.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
            <div className="rounded-xl border border-line px-3">
              <Toggle label="Publish team members' uploads automatically" description="Off: photos and videos from team members wait for admin approval before they appear publicly." checked={!!form.auto_publish_member_uploads} onChange={(v) => set('auto_publish_member_uploads', v)} />
            </div>
            <Button type="submit" loading={save.isPending}>Save settings</Button>
          </form>
        </Card>
        <Card title="Expense categories">
          <ul className="divide-y divide-line">
            {categories.data?.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span className={c.is_active ? '' : 'text-muted line-through'}>{c.name}</span>
                <span className="flex items-center gap-2">
                  {!c.is_active && <Badge>Hidden</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => toggleCat.mutate(c)}>{c.is_active ? 'Hide' : 'Restore'}</Button>
                </span>
              </li>
            ))}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (newCat.trim()) addCat.mutate(undefined); }}>
            <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <Button type="submit" icon={<Plus className="size-4" />} loading={addCat.isPending}>Add</Button>
          </form>
          <p className="mt-2 text-xs text-muted">Hidden categories stay on old expenses but can't be chosen for new ones.</p>
        </Card>
      </div>
    </>
  );
}
