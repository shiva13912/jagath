import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createEvent, createUser, pngBuffer, pool, setupDb } from './helpers.js';

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, member: U, other: U;
const YEAR = 2033;

beforeAll(async () => {
  await setupDb();
  admin = await createUser('admin');
  member = await createUser('member');
  other = await createUser('member');
  await createEvent(admin, YEAR, { budget: 0, addAllMembers: false });
});
afterAll(() => pool.end());

const sarees = async () => (await api().get(`/api/events/${YEAR}/sarees`).set('Cookie', member.cookie)).body;
const dash = async () => (await api().get(`/api/events/${YEAR}/dashboard`).set('Cookie', member.cookie)).body;

describe('saree inventory', () => {
  let purchaseId: number;
  let saleId: number;

  it('purchases compute totals and count as expenses', async () => {
    const res = await api()
      .post(`/api/events/${YEAR}/sarees/purchases`)
      .set('Cookie', member.cookie)
      .field('purchasedOn', '2033-10-10')
      .field('quantity', '100')
      .field('unitPrice', '300')
      .field('vendor', 'Weavers')
      .attach('bill', await pngBuffer(), 'bill.png');
    expect(res.status).toBe(201);
    expect(res.body.purchase.total_amount).toBe(30000);
    expect(res.body.purchase.proof).toBeTruthy();
    purchaseId = res.body.purchase.id;
    await api().post(`/api/events/${YEAR}/sarees/purchases`).set('Cookie', member.cookie).send({ purchasedOn: '2033-10-11', quantity: 50, unitPrice: 300 }).expect(201);
    const d = await dash();
    expect(d.finance.sareePurchases).toBe(45000);
    expect(d.finance.totalExpenses).toBe(45000);
    expect(d.expensesByCategory).toEqual([{ category: 'Sarees', amount: 45000, count: 2 }]);
  });

  it('sales reduce stock and count as income: purchased - sold = remaining', async () => {
    const res = await api().post(`/api/events/${YEAR}/sarees/sales`).set('Cookie', member.cookie).send({ soldOn: '2033-10-12', customerName: 'Ravi', quantity: 2, unitPrice: 400 });
    expect(res.status).toBe(201);
    expect(res.body.sale.total_amount).toBe(800);
    saleId = res.body.sale.id;
    await api().post(`/api/events/${YEAR}/sarees/sales`).set('Cookie', other.cookie).send({ soldOn: '2033-10-12', customerName: 'Devotees', quantity: 133, unitPrice: 400 }).expect(201);
    const s = await sarees();
    expect(s.summary).toMatchObject({ purchased: 150, sold: 135, remaining: 15, purchaseCost: 45000, salesRevenue: 54000 });
    const d = await dash();
    expect(d.finance.sareeSales).toBe(54000);
    expect(d.finance.balance).toBe(9000);
  });

  it('refuses to sell more than remaining stock', async () => {
    const res = await api().post(`/api/events/${YEAR}/sarees/sales`).set('Cookie', member.cookie).send({ soldOn: '2033-10-13', customerName: 'Big order', quantity: 16, unitPrice: 400 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Only 15 sarees left/);
  });

  it('concurrent sales cannot oversell the last sarees', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        api().post(`/api/events/${YEAR}/sarees/sales`).set('Cookie', member.cookie).send({ soldOn: '2033-10-13', customerName: 'Rush', quantity: 5, unitPrice: 400 }),
      ),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(3);
    expect((await sarees()).summary.remaining).toBe(0);
  });

  it('editing a sale recalculates, and cannot push stock negative', async () => {
    const bad = await api().put(`/api/saree-sales/${saleId}`).set('Cookie', member.cookie).send({ quantity: 3 });
    expect(bad.status).toBe(400);
    const ok = await api().put(`/api/saree-sales/${saleId}`).set('Cookie', member.cookie).send({ quantity: 1 });
    expect(ok.status).toBe(200);
    expect((await sarees()).summary).toMatchObject({ sold: 149, remaining: 1 });
  });

  it("members cannot edit others' records or delete; admin deletes are soft and guarded", async () => {
    expect((await api().put(`/api/saree-sales/${saleId}`).set('Cookie', other.cookie).send({ quantity: 1 })).status).toBe(403);
    expect((await api().delete(`/api/saree-sales/${saleId}`).set('Cookie', member.cookie)).status).toBe(403);
    // Deleting the 100-saree purchase would leave 50 purchased vs 149 sold.
    const guarded = await api().delete(`/api/saree-purchases/${purchaseId}`).set('Cookie', admin.cookie);
    expect(guarded.status).toBe(400);
    expect((await api().delete(`/api/saree-sales/${saleId}`).set('Cookie', admin.cookie)).status).toBe(200);
    expect((await sarees()).summary).toMatchObject({ sold: 148, remaining: 2 });
  });

  it('validates quantities', async () => {
    const res = await api().post(`/api/events/${YEAR}/sarees/purchases`).set('Cookie', member.cookie).send({ purchasedOn: '2033-10-10', quantity: 1.5, unitPrice: -1 });
    expect(res.status).toBe(400);
  });

  it('history reports each year', async () => {
    const res = await api().get('/api/sarees/history').set('Cookie', member.cookie);
    expect(res.body.history.find((h: any) => h.year === YEAR)).toMatchObject({ purchased: 150, sold: 148, remaining: 2 });
  });
});
