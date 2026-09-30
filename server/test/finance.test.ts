import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, categoryId, createEvent, createUser, pngBuffer, pool, setupDb } from './helpers.js';

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, ravi: U, shiva: U, kiran: U;
const YEAR = 2031;

const dash = async (u: U, year = YEAR) => {
  const res = await api().get(`/api/events/${year}/dashboard`).set('Cookie', u.cookie);
  expect(res.status).toBe(200);
  return res.body;
};

beforeAll(async () => {
  await setupDb();
  admin = await createUser('admin', 'Fin Admin');
  ravi = await createUser('member', 'Ravi');
  shiva = await createUser('member', 'Shiva');
  kiran = await createUser('member', 'Kiran');
  await createEvent(admin, YEAR, { addAllMembers: false });
  // Roster: three members expected to pay ₹5,000 each.
  const r = await api()
    .put(`/api/events/${YEAR}/roster`)
    .set('Cookie', admin.cookie)
    .send({ members: [ravi, shiva, kiran].map((m) => ({ userId: m.id, expected: 5000 })) });
  expect(r.status).toBe(200);
});
afterAll(() => pool.end());

describe('events', () => {
  it('only admins can create years', async () => {
    const res = await api().post('/api/events').set('Cookie', ravi.cookie).send({ year: 2040, title: 'x' });
    expect(res.status).toBe(403);
  });
  it('rejects a duplicate year', async () => {
    const res = await api().post('/api/events').set('Cookie', admin.cookie).send({ year: YEAR, title: 'dup' });
    expect(res.status).toBe(409);
  });
  it('team members cannot archive a year', async () => {
    const res = await api().delete(`/api/events/${YEAR}`).set('Cookie', ravi.cookie).send({ confirm: YEAR });
    expect(res.status).toBe(403);
  });
  it('unknown year gives 404', async () => {
    expect((await api().get('/api/events/1999/dashboard').set('Cookie', admin.cookie)).status).toBe(404);
  });
});

describe('the balance always follows the transactions (spec section 46)', () => {
  let expenseId: number;

  it('starts at zero with contribution status all pending', async () => {
    const d = await dash(ravi);
    expect(d.finance.balance).toBe(0);
    expect(d.contributions).toMatchObject({ members: 3, paid: 0, partial: 0, pending: 3, expected: 15000, received: 0, pendingAmount: 15000 });
    expect(d.myContribution).toMatchObject({ expected: 5000, paid: 0, status: 'pending' });
  });

  it('contributions 50,000 and expenses 20,000 give a balance of 30,000', async () => {
    // 3 members pay 5,000 + 5,000 + 3,000; the rest (37,000) arrives as other income from a sponsor.
    for (const [m, amt] of [[ravi, 5000], [shiva, 5000], [kiran, 3000]] as const) {
      const res = await api().post(`/api/events/${YEAR}/contributions`).set('Cookie', m.cookie).field('amount', String(amt)).field('paidOn', '2031-10-01');
      expect(res.status).toBe(201);
    }
    const inc = await api().post(`/api/events/${YEAR}/other-income`).set('Cookie', admin.cookie).send({ amount: 37000, source: 'Local sponsor', receivedOn: '2031-10-02' });
    expect(inc.status).toBe(201);
    const ex = await api()
      .post(`/api/events/${YEAR}/expenses`)
      .set('Cookie', ravi.cookie)
      .field('amount', '20000')
      .field('spentOn', '2031-10-03')
      .field('categoryId', String(await categoryId('Decoration')))
      .field('description', 'Decoration materials')
      .field('vendor', 'ABC Decorations')
      .attach('payment', await pngBuffer(), 'payment.png')
      .attach('bill', await pngBuffer('#000'), 'bill.png');
    expect(ex.status).toBe(201);
    expect(ex.body.expense.proofs).toHaveLength(2);
    expenseId = ex.body.expense.id;

    const d = await dash(admin);
    expect(d.finance.contributions).toBe(13000);
    expect(d.finance.totalIncome).toBe(50000);
    expect(d.finance.totalExpenses).toBe(20000);
    expect(d.finance.balance).toBe(30000);
    expect(d.contributions).toMatchObject({ paid: 2, partial: 1, pending: 0, received: 13000, pendingAmount: 2000 });
    expect(d.expensesByCategory).toEqual([{ category: 'Decoration', amount: 20000, count: 1 }]);
  });

  it('a ₹5,000 contribution makes it 35,000; a ₹3,000 expense makes it 32,000', async () => {
    await api().post(`/api/events/${YEAR}/contributions`).set('Cookie', kiran.cookie).field('amount', '5000').field('paidOn', '2031-10-04').expect(201);
    expect((await dash(ravi)).finance.balance).toBe(35000);

    await api()
      .post(`/api/events/${YEAR}/expenses`)
      .set('Cookie', shiva.cookie)
      .field('amount', '3000')
      .field('spentOn', '2031-10-05')
      .field('categoryId', String(await categoryId('Food')))
      .field('description', 'Prasad')
      .expect(201);
    const d = await dash(ravi);
    expect(d.finance.totalIncome).toBe(55000);
    expect(d.finance.totalExpenses).toBe(23000);
    expect(d.finance.balance).toBe(32000);
    // Kiran overpaid (3,000 + 5,000 = 8,000 vs 5,000 expected): status paid, pending 0.
    expect(d.contributions).toMatchObject({ paid: 3, partial: 0, pending: 0, pendingAmount: 0 });
  });

  it('editing an expense recalculates totals and records before/after in the audit log', async () => {
    const res = await api().put(`/api/expenses/${expenseId}`).set('Cookie', ravi.cookie).send({ amount: 18000 });
    expect(res.status).toBe(200);
    expect((await dash(admin)).finance.balance).toBe(34000);
    const detail = await api().get(`/api/expenses/${expenseId}`).set('Cookie', admin.cookie);
    const update = detail.body.expense.history.find((h: any) => h.action === 'update');
    expect(update.details.amount).toEqual({ from: 20000, to: 18000 });
  });

  it('deleting an expense (admin) is a soft delete that no longer counts', async () => {
    const res = await api().delete(`/api/expenses/${expenseId}`).set('Cookie', admin.cookie).send({ reason: 'duplicate' });
    expect(res.status).toBe(200);
    expect((await dash(admin)).finance.balance).toBe(52000);
    const { rows } = await pool.query('SELECT deleted_at FROM expenses WHERE id = $1', [expenseId]);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('budget is the plan, not the balance', async () => {
    await api().put(`/api/events/${YEAR}/budget`).set('Cookie', admin.cookie).send({ plannedAmount: 60000 }).expect(200);
    const d = await dash(admin);
    expect(d.finance.budget).toBe(60000);
    expect(d.finance.balance).toBe(52000);
    expect(d.finance.budgetUsedPct).toBe(5); // 3,000 of 60,000
  });
});

describe('permissions on money', () => {
  it('a member cannot record a contribution for someone else', async () => {
    const res = await api().post(`/api/events/${YEAR}/contributions`).set('Cookie', ravi.cookie).field('userId', String(shiva.id)).field('amount', '100').field('paidOn', '2031-10-01');
    expect(res.status).toBe(403);
  });

  it('admin can record a contribution for a member', async () => {
    const res = await api().post(`/api/events/${YEAR}/contributions`).set('Cookie', admin.cookie).send({ userId: shiva.id, amount: 1, paidOn: '2031-10-01' });
    expect(res.status).toBe(201);
    expect(res.body.payment.member_name).toBe('Shiva');
  });

  it("a member cannot edit someone else's expense, or delete any expense", async () => {
    const ex = await api()
      .post(`/api/events/${YEAR}/expenses`)
      .set('Cookie', shiva.cookie)
      .send({ amount: 100, spentOn: '2031-10-06', categoryId: await categoryId('Other'), description: 'Tape' });
    expect(ex.status).toBe(201);
    expect((await api().put(`/api/expenses/${ex.body.expense.id}`).set('Cookie', ravi.cookie).send({ amount: 1 })).status).toBe(403);
    expect((await api().delete(`/api/expenses/${ex.body.expense.id}`).set('Cookie', shiva.cookie)).status).toBe(403);
  });

  it('only admins manage the budget, other income and categories', async () => {
    expect((await api().put(`/api/events/${YEAR}/budget`).set('Cookie', ravi.cookie).send({ plannedAmount: 1 })).status).toBe(403);
    expect((await api().post(`/api/events/${YEAR}/other-income`).set('Cookie', ravi.cookie).send({ amount: 1, source: 'x', receivedOn: '2031-01-01' })).status).toBe(403);
    expect((await api().post('/api/expense-categories').set('Cookie', ravi.cookie).send({ name: 'Hack' })).status).toBe(403);
  });

  it('validates amounts and dates', async () => {
    const bad = await api().post(`/api/events/${YEAR}/expenses`).set('Cookie', ravi.cookie).send({ amount: -5, spentOn: '12-10-2031', categoryId: 1, description: '' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(['amount', 'spentOn', 'description']));
    const decimals = await api().post(`/api/events/${YEAR}/contributions`).set('Cookie', ravi.cookie).send({ amount: 10.123, paidOn: '2031-10-01' });
    expect(decimals.status).toBe(400);
  });
});

describe('private proofs', () => {
  let fileId: number;
  beforeAll(async () => {
    const res = await api()
      .post(`/api/events/${YEAR}/contributions`)
      .set('Cookie', ravi.cookie)
      .field('amount', '10')
      .field('paidOn', '2031-10-07')
      .attach('proof', await pngBuffer(), 'screenshot.png');
    expect(res.status).toBe(201);
    fileId = res.body.payment.proof.id;
  });

  it('team members can view payment screenshots', async () => {
    const res = await api().get(`/api/files/${fileId}`).set('Cookie', shiva.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toMatch(/private/);
  });

  it('the public cannot access payment screenshots', async () => {
    expect((await api().get(`/api/files/${fileId}`)).status).toBe(401);
  });

  it('rejects files whose content is not an allowed type, whatever the name says', async () => {
    const res = await api()
      .post(`/api/events/${YEAR}/contributions`)
      .set('Cookie', ravi.cookie)
      .field('amount', '10')
      .field('paidOn', '2031-10-07')
      .attach('proof', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not an allowed file type/);
    // And nothing was saved.
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM contributions WHERE notes IS NULL AND amount = 10 AND paid_on = '2031-10-07'");
    expect(rows[0].n).toBe(1);
  });
});

describe('year isolation', () => {
  it('records in one year never appear in another', async () => {
    await createEvent(admin, YEAR + 1);
    const d = await dash(admin, YEAR + 1);
    expect(d.finance.totalIncome).toBe(0);
    expect(d.finance.totalExpenses).toBe(0);
    const list = await api().get(`/api/events/${YEAR + 1}/expenses`).set('Cookie', admin.cookie);
    expect(list.body.items).toHaveLength(0);
  });

  it('the yearly trend lists each year separately', async () => {
    const res = await api().get('/api/events/trend').set('Cookie', ravi.cookie);
    const y = res.body.trend.find((t: any) => t.year === YEAR);
    expect(y.balance).toBe((await dash(admin)).finance.balance);
  });
});

describe('expense list filters', () => {
  it('filters by category, member, date and search, and paginates', async () => {
    const food = await categoryId('Food');
    const byCat = await api().get(`/api/events/${YEAR}/expenses?category=${food}`).set('Cookie', ravi.cookie);
    expect(byCat.body.items.every((e: any) => e.category === 'Food')).toBe(true);
    const byMember = await api().get(`/api/events/${YEAR}/expenses?paidBy=${shiva.id}`).set('Cookie', ravi.cookie);
    expect(byMember.body.items.every((e: any) => e.paid_by === shiva.id)).toBe(true);
    const search = await api().get(`/api/events/${YEAR}/expenses?q=prasad`).set('Cookie', ravi.cookie);
    expect(search.body.items).toHaveLength(1);
    const dates = await api().get(`/api/events/${YEAR}/expenses?from=2031-10-06&to=2031-10-06`).set('Cookie', ravi.cookie);
    expect(dates.body.items.map((e: any) => e.description)).toEqual(['Tape']);
    const page = await api().get(`/api/events/${YEAR}/expenses?pageSize=1&page=2&sort=amount_desc`).set('Cookie', ravi.cookie);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(2);
  });
});

describe('activity log', () => {
  it('admins see the full log with details; members get a limited feed', async () => {
    const full = await api().get(`/api/activity?year=${YEAR}`).set('Cookie', admin.cookie);
    expect(full.status).toBe(200);
    expect(full.body.items[0]).toHaveProperty('ip');
    const limited = await api().get('/api/activity').set('Cookie', ravi.cookie);
    expect(limited.body.limited).toBe(true);
    expect(limited.body.items[0]).not.toHaveProperty('ip');
    expect(limited.body.items[0]).not.toHaveProperty('details');
    expect(limited.body.items.some((i: any) => i.entity_type === 'user')).toBe(false);
  });

  it('settings are admin only', async () => {
    expect((await api().get('/api/settings').set('Cookie', ravi.cookie)).status).toBe(403);
    expect((await api().put('/api/settings').set('Cookie', admin.cookie).send({ tagline: 'Hello' })).status).toBe(200);
  });
});
