import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, categoryId, createEvent, createUser, jpegBuffer, pngBuffer, pool, setupDb } from './helpers.js';

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, member: U;
const PUB = 2037;
const HIDDEN = 2038;

/** Keys that must never appear anywhere in a public response. */
const FORBIDDEN_KEYS = ['email', 'phone', 'password_hash', 'proof', 'proof_file_id', 'storage_key', 'thumb_key', 'uploaded_by', 'uploaded_by_name', 'created_by', 'notes', 'ip', 'details', 'customer_name', 'paid_by', 'paid_by_name', 'vendor'];
function assertNoPrivateKeys(value: unknown, path = '$') {
  if (Array.isArray(value)) value.forEach((v, i) => assertNoPrivateKeys(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      expect(FORBIDDEN_KEYS, `${path}.${k} must not be public`).not.toContain(k);
      assertNoPrivateKeys(v, `${path}.${k}`);
    }
  }
}

beforeAll(async () => {
  await setupDb();
  admin = await createUser('admin');
  member = await createUser('member', 'Public Tester');
  await createEvent(admin, PUB, { isPublished: true, addAllMembers: false });
  await createEvent(admin, HIDDEN, { isPublished: false });
  await api().put(`/api/events/${PUB}/roster`).set('Cookie', admin.cookie).send({ members: [{ userId: member.id, expected: 5000 }] }).expect(200);
  await api().post(`/api/events/${PUB}/contributions`).set('Cookie', member.cookie).field('amount', '3000').field('paidOn', '2037-10-01').field('notes', 'secret note').attach('proof', await pngBuffer(), 'upi.png').expect(201);
  await api().post(`/api/events/${PUB}/expenses`).set('Cookie', member.cookie).field('amount', '1200').field('spentOn', '2037-10-02').field('categoryId', String(await categoryId('Flowers'))).field('description', 'Garlands').field('vendor', 'Flower Shop').attach('bill', await pngBuffer(), 'bill.png').expect(201);
  await api().post(`/api/events/${PUB}/sarees/purchases`).set('Cookie', member.cookie).send({ purchasedOn: '2037-10-01', quantity: 10, unitPrice: 300 }).expect(201);
  await api().post(`/api/events/${PUB}/sarees/sales`).set('Cookie', member.cookie).send({ soldOn: '2037-10-03', customerName: 'Private Person', quantity: 3, unitPrice: 400 }).expect(201);
  const album = await api().post(`/api/events/${PUB}/albums`).set('Cookie', admin.cookie).send({ name: 'Main Event' });
  await api().post(`/api/albums/${album.body.album.id}/media`).set('Cookie', admin.cookie).attach('files', await jpegBuffer(), 'a.jpg').expect(201);
  await api().post(`/api/albums/${album.body.album.id}/media`).set('Cookie', member.cookie).attach('files', await jpegBuffer(), 'pending.jpg').expect(201);
});
afterAll(() => pool.end());

describe('public users cannot reach private APIs', () => {
  const privateEndpoints: Array<[string, string]> = [
    ['get', '/api/members'], ['get', '/api/members/1'], ['post', '/api/members'], ['get', '/api/events'], ['post', '/api/events'],
    ['get', `/api/events/${PUB}/dashboard`], ['get', `/api/events/${PUB}/contributions`], ['post', `/api/events/${PUB}/contributions`],
    ['get', `/api/events/${PUB}/expenses`], ['post', `/api/events/${PUB}/expenses`], ['get', '/api/expenses/1'], ['delete', '/api/expenses/1'],
    ['get', `/api/events/${PUB}/budget`], ['put', `/api/events/${PUB}/budget`], ['get', `/api/events/${PUB}/sarees`],
    ['post', `/api/events/${PUB}/sarees/sales`], ['get', `/api/events/${PUB}/albums`], ['post', '/api/albums/1/media'],
    ['get', '/api/files/1'], ['get', '/api/activity'], ['get', '/api/settings'], ['get', '/api/stream'],
  ];
  it.each(privateEndpoints)('%s %s → 401', async (method, url) => {
    const res = await (api() as any)[method](url);
    expect(res.status).toBe(401);
  });
});

describe('public website data', () => {
  it('lists only published years', async () => {
    const res = await api().get('/api/public/events');
    const years = res.body.events.map((e: any) => e.year);
    expect(years).toContain(PUB);
    expect(years).not.toContain(HIDDEN);
    expect((await api().get(`/api/public/events/${HIDDEN}`)).status).toBe(404);
    expect((await api().get(`/api/public/events/${HIDDEN}/finance`)).status).toBe(404);
    assertNoPrivateKeys(res.body);
  });

  it('finance summary: aggregates only by default', async () => {
    const res = await api().get(`/api/public/events/${PUB}/finance`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ contributions: 3000, sareeSales: 1200, totalIncome: 4200, expenses: 1200, sareePurchases: 3000, totalExpenses: 4200, balance: 0 });
    expect(res.body.contributors).toMatchObject({ members: 1, contributed: 1, partial: 1, pending: 0, list: null });
    expect(res.body.expenses).toBeNull();
    assertNoPrivateKeys(res.body);
    expect(JSON.stringify(res.body)).not.toMatch(/secret note|upi\.png|bill\.png|Flower Shop/);
  });

  it('named contributor sheet and expense list appear only when enabled, still without proofs', async () => {
    await api().put(`/api/events/${PUB}`).set('Cookie', admin.cookie).send({ publicContributorNames: true, publicExpenseList: true }).expect(200);
    const res = await api().get(`/api/public/events/${PUB}/finance`);
    expect(res.body.contributors.list).toEqual([{ name: 'Public Tester', amount: 3000, status: 'partial' }]);
    expect(res.body.expenses).toEqual([{ spent_on: '2037-10-02', category: 'Flowers', description: 'Garlands', amount: 1200 }]);
    assertNoPrivateKeys(res.body);
  });

  it('members who opted out appear anonymously', async () => {
    await api().put('/api/members/me').set('Cookie', member.cookie).send({ showOnPublicSite: false }).expect(200);
    const res = await api().get(`/api/public/events/${PUB}/finance`);
    expect(res.body.contributors.list[0].name).toBe('A team member');
    await api().put('/api/members/me').set('Cookie', member.cookie).send({ showOnPublicSite: true }).expect(200);
  });

  it('hiding finance hides the numbers', async () => {
    await api().put(`/api/events/${PUB}`).set('Cookie', admin.cookie).send({ publicFinance: false }).expect(200);
    const res = await api().get(`/api/public/events/${PUB}/finance`);
    expect(res.body).toEqual({ year: PUB, available: false });
    await api().put(`/api/events/${PUB}`).set('Cookie', admin.cookie).send({ publicFinance: true }).expect(200);
  });

  it('saree history: counts always, sales list only when enabled and never with customer names', async () => {
    let res = await api().get(`/api/public/events/${PUB}/sarees`);
    expect(res.body.summary).toMatchObject({ purchased: 10, sold: 3, remaining: 7 });
    expect(res.body.sales).toBeNull();
    await api().put(`/api/events/${PUB}`).set('Cookie', admin.cookie).send({ publicSareeSales: true }).expect(200);
    res = await api().get(`/api/public/events/${PUB}/sarees`);
    expect(res.body.sales).toHaveLength(1);
    assertNoPrivateKeys(res.body);
    expect(JSON.stringify(res.body)).not.toMatch(/Private Person/);
  });

  it('gallery shows only approved media, without uploader identity', async () => {
    const gallery = await api().get(`/api/public/events/${PUB}/gallery`);
    expect(gallery.body.albums).toHaveLength(1);
    expect(gallery.body.albums[0].photo_count).toBe(1);
    const album = await api().get(`/api/public/albums/${gallery.body.albums[0].id}`);
    expect(album.body.items).toHaveLength(1);
    assertNoPrivateKeys(album.body);
    const featured = await api().get('/api/public/featured');
    assertNoPrivateKeys(featured.body);
  });

  it('public team list exposes contact details only when marked public', async () => {
    const res = await api().get('/api/public/team');
    const me = res.body.team.find((t: any) => t.name === 'Public Tester');
    expect(me).toEqual({ name: 'Public Tester', email: null, phone: null });
  });
});
