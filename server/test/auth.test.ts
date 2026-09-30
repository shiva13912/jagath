import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, pool, setupDb } from './helpers.js';

let admin: Awaited<ReturnType<typeof createUser>>;
let member: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await setupDb();
  admin = await createUser('admin', 'Test Admin');
  member = await createUser('member', 'Test Member');
});
afterAll(() => pool.end());

describe('authentication', () => {
  it('rejects wrong passwords with a generic message', async () => {
    const res = await api().post('/api/auth/login').send({ email: member.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });

  it('rejects unknown emails with the same message', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nobody@example.test', password: 'whatever1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });

  it('sets an httpOnly session cookie and returns the user', async () => {
    const res = await api().post('/api/auth/login').send({ email: member.email, password: member.password });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/dm_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.body.user.role).toBe('member');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('/me requires a session', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    const res = await api().get('/api/auth/me').set('Cookie', member.cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(member.email);
  });

  it('/session answers 200 with or without a login', async () => {
    const anon = await api().get('/api/auth/session');
    expect(anon.status).toBe(200);
    expect(anon.body.user).toBeNull();
    const res = await api().get('/api/auth/session').set('Cookie', member.cookie);
    expect(res.body.user.email).toBe(member.email);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects a forged token', async () => {
    const res = await api().get('/api/auth/me').set('Cookie', 'dm_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.');
    expect(res.status).toBe(401);
  });

  it('a deactivated user loses access immediately', async () => {
    const temp = await createUser('member');
    expect((await api().delete(`/api/members/${temp.id}`).set('Cookie', admin.cookie)).status).toBe(200);
    expect((await api().get('/api/auth/me').set('Cookie', temp.cookie)).status).toBe(401);
    const login = await api().post('/api/auth/login').send({ email: temp.email, password: temp.password });
    expect(login.status).toBe(401);
  });

  it('changes password with the correct current password only', async () => {
    const temp = await createUser('member');
    const bad = await api().put('/api/auth/password').set('Cookie', temp.cookie).send({ currentPassword: 'nope', newPassword: 'newpassword1' });
    expect(bad.status).toBe(400);
    const ok = await api().put('/api/auth/password').set('Cookie', temp.cookie).send({ currentPassword: temp.password, newPassword: 'newpassword1' });
    expect(ok.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: temp.email, password: 'newpassword1' })).status).toBe(200);
  });
});

describe('member management authorization', () => {
  it('public users cannot list members', async () => {
    expect((await api().get('/api/members')).status).toBe(401);
  });

  it('team members can view members but not admin notes', async () => {
    const res = await api().get('/api/members').set('Cookie', member.cookie);
    expect(res.status).toBe(200);
    expect(res.body.members.length).toBeGreaterThan(0);
    expect(res.body.members[0]).not.toHaveProperty('notes');
    expect(res.body.members[0]).not.toHaveProperty('password_hash');
  });

  it('team members cannot create accounts', async () => {
    const res = await api()
      .post('/api/members')
      .set('Cookie', member.cookie)
      .send({ name: 'Sneaky', email: 'sneaky@example.test', password: 'password123', role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('a team member cannot make themselves admin', async () => {
    const viaAdminRoute = await api().put(`/api/members/${member.id}`).set('Cookie', member.cookie).send({ role: 'admin' });
    expect(viaAdminRoute.status).toBe(403);
    const viaProfile = await api().put('/api/members/me').set('Cookie', member.cookie).send({ role: 'admin' });
    expect(viaProfile.status).toBe(400);
    const me = await api().get('/api/auth/me').set('Cookie', member.cookie);
    expect(me.body.user.role).toBe('member');
  });

  it('team members can edit their own profile fields', async () => {
    const res = await api().put('/api/members/me').set('Cookie', member.cookie).send({ phone: '+91 90000 00000', phonePublic: false });
    expect(res.status).toBe(200);
    expect(res.body.member.phone).toBe('+91 90000 00000');
  });

  it('admin can create, edit and change the role of a member', async () => {
    const created = await api()
      .post('/api/members')
      .set('Cookie', admin.cookie)
      .send({ name: 'New Person', email: `new-${Date.now()}@example.test`, password: 'password123' });
    expect(created.status).toBe(201);
    expect(created.body.member.role).toBe('member');
    const updated = await api().put(`/api/members/${created.body.member.id}`).set('Cookie', admin.cookie).send({ role: 'admin', name: 'Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.member.role).toBe('admin');
    expect(updated.body.member.name).toBe('Renamed');
  });

  it('rejects duplicate emails and invalid input', async () => {
    const dup = await api().post('/api/members').set('Cookie', admin.cookie).send({ name: 'Dup', email: member.email.toUpperCase(), password: 'password123' });
    expect(dup.status).toBe(409);
    const bad = await api().post('/api/members').set('Cookie', admin.cookie).send({ name: '', email: 'not-an-email', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toBeTruthy();
  });

  it('admin cannot demote themselves', async () => {
    const res = await api().put(`/api/members/${admin.id}`).set('Cookie', admin.cookie).send({ role: 'member' });
    expect(res.status).toBe(400);
  });

  it('records member changes in the audit log, which cannot be modified', async () => {
    const { rows } = await pool.query(`SELECT * FROM activity_logs WHERE entity_type = 'user' AND action = 'create'`);
    expect(rows.length).toBeGreaterThan(0);
    await expect(pool.query('UPDATE activity_logs SET summary = $1', ['tampered'])).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM activity_logs')).rejects.toThrow(/append-only/);
  });
});

describe('api hygiene', () => {
  it('returns JSON 404 for unknown endpoints', async () => {
    const res = await api().get('/api/does-not-exist').set('Cookie', member.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('blocks cross-site writes', async () => {
    const res = await api().post('/api/auth/logout').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});
