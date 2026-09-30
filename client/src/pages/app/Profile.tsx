import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, PageHeader, Toggle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useSave } from '../../lib/hooks';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    name: user!.name,
    phone: user!.phone ?? '',
    showOnPublicSite: user!.show_on_public_site,
    emailPublic: user!.email_public,
    phonePublic: user!.phone_public,
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const save = useSave(() => api.put('/members/me', form), { success: 'Profile saved', onSuccess: () => refresh() });
  const changePw = useSave(() => api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }), {
    success: 'Password changed',
    onSuccess: () => setPw({ currentPassword: '', newPassword: '', confirm: '' }),
  });

  return (
    <>
      <PageHeader title="My profile" subtitle={`${user!.email} · ${user!.role === 'admin' ? 'Admin' : 'Team member'}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              save.mutate(undefined);
            }}
          >
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="divide-y divide-line rounded-xl border border-line px-3">
              <Toggle label="Show my name on the public site" checked={form.showOnPublicSite} onChange={(v) => setForm({ ...form, showOnPublicSite: v })} />
              <Toggle label="Make my email public" checked={form.emailPublic} onChange={(v) => setForm({ ...form, emailPublic: v })} />
              <Toggle label="Make my phone public" checked={form.phonePublic} onChange={(v) => setForm({ ...form, phonePublic: v })} />
            </div>
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </form>
        </Card>
        <Card title="Change password">
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              changePw.mutate(undefined);
            }}
          >
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password" error={pw.confirm && pw.confirm !== pw.newPassword ? 'Passwords do not match' : undefined}>
              <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            <Button type="submit" loading={changePw.isPending} disabled={!pw.currentPassword || pw.newPassword.length < 8 || pw.newPassword !== pw.confirm}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
