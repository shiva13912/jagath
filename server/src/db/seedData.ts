import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { storage } from '../services/storage/index.js';
import { pool } from './pool.js';
import type { Ids } from './seed.js';

/**
 * Fake data for three years so every screen has something to show.
 * Amounts are chosen so 2026 lands on: some paid, some partial, some pending.
 */

interface YearPlan {
  year: number;
  budget: number;
  expected: number;
  published: boolean;
  start: string;
  end: string;
  /** member first name -> list of [amount, date] payments */
  payments: Record<string, Array<[number, string]>>;
  expenses: Array<[number, string, string, string, string, string | null]>; // amount, date, category, reason, paidBy, vendor
  income: Array<[number, string, string]>; // amount, date, source
  sareeBuys: Array<[number, number, string, string, string]>; // qty, price, date, vendor, by
  sareeSales: Array<[number, number, string, string, string]>; // qty, price, date, customer, recorder
}

const allPaid = (amount: number, date: string, names: string[]) => Object.fromEntries(names.map((n) => [n, [[amount, date]]])) as Record<string, Array<[number, string]>>;
const NAMES = ['Anil', 'Ravi', 'Shiva', 'Kiran', 'Suresh', 'Priya', 'Lakshmi', 'Mahesh', 'Deepa', 'Venkat'];

const PLANS: YearPlan[] = [
  {
    year: 2024, budget: 80000, expected: 4000, published: true, start: '2024-10-03', end: '2024-10-12',
    payments: allPaid(4000, '2024-09-20', NAMES),
    expenses: [
      [14000, '2024-09-28', 'Decoration', 'Pandal decoration and lights rental', 'Ravi', 'Sri Sai Decorators'],
      [12500, '2024-10-05', 'Food', 'Annadanam on day 5', 'Kiran', 'Annapurna Caterers'],
      [5200, '2024-10-03', 'Flowers', 'Marigold garlands for 10 days', 'Priya', 'City Flower Market'],
      [6000, '2024-10-01', 'Sound', 'Sound system for 10 days', 'Suresh', 'Beat Sounds'],
      [3500, '2024-10-12', 'Transportation', 'Tractor for procession', 'Mahesh', null],
      [2800, '2024-09-25', 'Printing', 'Banners and pamphlets', 'Deepa', 'Quick Print'],
      [4100, '2024-10-03', 'Pooja materials', 'Kumkum, turmeric, camphor, incense', 'Lakshmi', null],
    ],
    income: [[8000, '2024-10-06', 'Donation box collections']],
    sareeBuys: [[100, 280, '2024-09-26', 'Pochampally Weavers', 'Lakshmi']],
    sareeSales: [[40, 350, '2024-10-10', 'Devotees on day 8', 'Priya'], [52, 350, '2024-10-12', 'Devotees on Vijayadashami', 'Lakshmi']],
  },
  {
    year: 2025, budget: 90000, expected: 4500, published: true, start: '2025-09-22', end: '2025-10-02',
    payments: { ...allPaid(4500, '2025-09-10', NAMES.filter((n) => n !== 'Venkat')), Venkat: [[2500, '2025-09-15']] },
    expenses: [
      [16500, '2025-09-18', 'Decoration', 'Pandal decoration with LED backdrop', 'Ravi', 'Sri Sai Decorators'],
      [15000, '2025-09-27', 'Food', 'Annadanam for 400 people', 'Kiran', 'Annapurna Caterers'],
      [6200, '2025-09-22', 'Flowers', 'Flowers for 10 days', 'Priya', 'City Flower Market'],
      [7000, '2025-09-20', 'Sound', 'Sound and DJ for procession', 'Suresh', 'Beat Sounds'],
      [5500, '2025-09-20', 'Lighting', 'Street lighting', 'Shiva', 'Bright Electricals'],
      [4000, '2025-10-02', 'Transportation', 'Procession vehicle', 'Mahesh', null],
      [3100, '2025-09-15', 'Printing', 'Flex banners', 'Deepa', 'Quick Print'],
      [4800, '2025-09-22', 'Pooja materials', 'Pooja items', 'Lakshmi', null],
    ],
    income: [[10000, '2025-09-25', 'Sponsorship: Ganesh Traders'], [6500, '2025-09-30', 'Donation box collections']],
    sareeBuys: [[120, 290, '2025-09-12', 'Pochampally Weavers', 'Lakshmi']],
    sareeSales: [[60, 380, '2025-09-28', 'Devotees on day 7', 'Priya'], [50, 380, '2025-10-02', 'Devotees on Vijayadashami', 'Lakshmi']],
  },
  {
    year: 2026, budget: 100000, expected: 5000, published: true, start: '2026-10-11', end: '2026-10-20',
    payments: {
      Anil: [[5000, '2026-09-05']],
      Ravi: [[5000, '2026-09-10']],
      Shiva: [[3000, '2026-09-12']],
      Kiran: [[2000, '2026-09-08'], [3000, '2026-09-20']],
      Suresh: [[5000, '2026-09-14']],
      Priya: [[5000, '2026-09-11']],
      Lakshmi: [[5000, '2026-09-15']],
      Mahesh: [[2500, '2026-09-18']],
      // Deepa and Venkat have not paid yet.
    },
    expenses: [
      [8000, '2026-09-20', 'Decoration', 'Advance for pandal decoration', 'Shiva', 'Sri Sai Decorators'],
      [4500, '2026-09-22', 'Flowers', 'Flower booking advance', 'Ravi', 'City Flower Market'],
      [4000, '2026-09-24', 'Decoration', 'Decoration materials', 'Ravi', 'ABC Decorations'],
      [3000, '2026-09-25', 'Sound', 'Sound system advance', 'Suresh', 'Beat Sounds'],
      [2600, '2026-09-26', 'Printing', 'Invitation cards and banners', 'Deepa', 'Quick Print'],
      [1800, '2026-09-27', 'Pooja materials', 'Pooja items for kalash sthapana', 'Lakshmi', null],
      [1500, '2026-09-28', 'Transportation', 'Auto charges for material pickup', 'Kiran', null],
    ],
    income: [[20000, '2026-09-21', 'Sponsorship: Lakshmi Jewellers'], [5000, '2026-09-27', 'Donation from residents association']],
    sareeBuys: [[60, 300, '2026-09-15', 'Pochampally Weavers', 'Lakshmi'], [40, 300, '2026-09-25', 'Gadwal Handlooms', 'Priya']],
    sareeSales: [[2, 400, '2026-09-26', 'Ravi', 'Priya'], [5, 400, '2026-09-27', 'Neighbourhood advance orders', 'Lakshmi'], [8, 400, '2026-09-28', 'Temple committee', 'Lakshmi']],
  },
];

const tmp = path.join(os.tmpdir(), 'durgamatha-seed');

/** Draws a fake receipt / UPI screenshot so proofs look real in the demo. */
async function fakeDoc(kind: 'upi' | 'bill', title: string, amount: number, date: string): Promise<string> {
  await fs.mkdir(tmp, { recursive: true });
  const w = 540, h = kind === 'upi' ? 900 : 720;
  const esc = (s: string) => s.replace(/[<>&]/g, '');
  const svg = kind === 'upi'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f4f7fb"/>
       <circle cx="270" cy="220" r="70" fill="#0ca30c"/><path d="M235 222l25 25 50-55" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round"/>
       <text x="270" y="360" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#1f1a17">Payment successful</text>
       <text x="270" y="440" font-family="sans-serif" font-size="56" font-weight="bold" text-anchor="middle" fill="#1f1a17">₹${amount.toLocaleString('en-IN')}</text>
       <text x="270" y="500" font-family="sans-serif" font-size="24" text-anchor="middle" fill="#6b625c">${esc(title)}</text>
       <text x="270" y="540" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#6b625c">${date} · SAMPLE (not a real payment)</text></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fffdf6"/>
       <text x="40" y="80" font-family="serif" font-size="34" font-weight="bold" fill="#1f1a17">${esc(title)}</text>
       <text x="40" y="120" font-family="sans-serif" font-size="20" fill="#6b625c">Cash / Credit Bill · ${date}</text>
       <line x1="40" y1="150" x2="500" y2="150" stroke="#999" stroke-dasharray="6 6"/>
       <text x="40" y="200" font-family="monospace" font-size="22" fill="#1f1a17">Items as per order ........ 1</text>
       <text x="40" y="560" font-family="monospace" font-size="30" font-weight="bold" fill="#1f1a17">TOTAL  ₹${amount.toLocaleString('en-IN')}</text>
       <text x="40" y="660" font-family="sans-serif" font-size="18" fill="#b32a25">SAMPLE BILL FOR DEMO DATA</text></svg>`;
  const file = path.join(tmp, `${crypto.randomUUID()}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function storeFile(eventId: number, year: number, userId: number, purpose: string, src: string, name: string): Promise<number> {
  const key = `events/${year}/private/${crypto.randomUUID()}.png`;
  await storage.put(key, src, 'image/png');
  const { size } = await fs.stat(src);
  const { rows } = await pool.query(
    `INSERT INTO files (event_id, storage_key, original_name, mime_type, size_bytes, purpose, uploaded_by) VALUES ($1,$2,$3,'image/png',$4,$5,$6) RETURNING id`,
    [eventId, key, name, size, purpose, userId],
  );
  return rows[0].id;
}

const log = (userId: number, action: string, entity: string, entityId: number, eventId: number, summary: string, at: string) =>
  pool.query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, event_id, summary, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, action, entity, String(entityId), eventId, summary, `${at}T10:00:00+05:30`],
  );

export async function seedData(ids: Ids) {
  const admin = ids.Anil!;
  const cats = Object.fromEntries((await pool.query('SELECT id, name FROM expense_categories')).rows.map((r) => [r.name, r.id]));
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const eventIds: Record<number, number> = {};

  for (const p of PLANS) {
    const current = p.year === 2026;
    const { rows } = await pool.query(
      `INSERT INTO events (year, title, description, location, start_date, end_date, default_expected_contribution,
         is_published, public_finance, public_contributor_names, public_expense_list, public_saree_sales, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11,$12) RETURNING id`,
      [
        p.year, `Durgamatha Utsav ${p.year}`,
        current
          ? 'Ten days of Navaratri celebrations with daily pooja, annadanam, cultural programmes and the Vijayadashami procession. Preparations are under way.'
          : `Our ${p.year} Navaratri celebration: daily pooja, annadanam, cultural evenings and the grand procession on Vijayadashami.`,
        'Gandhi Nagar Community Ground', p.start, p.end, p.expected, p.published,
        p.year !== 2025, p.year === 2024, p.year === 2024, admin,
      ],
    );
    const eventId = rows[0].id;
    eventIds[p.year] = eventId;
    await pool.query('INSERT INTO budgets (event_id, planned_amount, notes, updated_by) VALUES ($1,$2,$3,$4)', [
      eventId, p.budget, 'Decoration 30% · Food 20% · Flowers, sound & lighting 25% · Sarees stock and other 25%', admin,
    ]);
    await pool.query(`INSERT INTO event_members (event_id, user_id, expected_amount) SELECT $1, id, $2 FROM users`, [eventId, p.expected]);
    await log(admin, 'create', 'event', eventId, eventId, `Anil Sharma created event ${p.year}`, `${p.year}-08-01`);

    let proofCount = 0;
    for (const [name, list] of Object.entries(p.payments)) {
      for (const [amount, date] of list) {
        const uid = ids[name]!;
        const proof = current && proofCount++ < 6 ? await storeFile(eventId, p.year, uid, 'contribution_proof', await fakeDoc('upi', 'Paid to Durgamatha Utsav', amount, date), 'upi-screenshot.png') : null;
        const r = await pool.query(
          `INSERT INTO contributions (event_id, user_id, amount, paid_on, method, proof_file_id, created_by, created_at) VALUES ($1,$2,$3,$4,'upi',$5,$2,$6) RETURNING id`,
          [eventId, uid, amount, date, proof, `${date}T09:00:00+05:30`],
        );
        await log(uid, 'create', 'contribution', r.rows[0].id, eventId, `${name} added a contribution of ${inr(amount)}${proof ? ' with proof' : ''}`, date);
      }
    }
    for (const [amount, date, source] of p.income) {
      const r = await pool.query(`INSERT INTO other_incomes (event_id, amount, source, received_on, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [eventId, amount, source, date, admin]);
      await log(admin, 'create', 'other_income', r.rows[0].id, eventId, `Anil recorded ${inr(amount)} income from ${source}`, date);
    }
    for (const [amount, date, cat, reason, by, vendor] of p.expenses) {
      const uid = ids[by]!;
      const r = await pool.query(
        `INSERT INTO expenses (event_id, amount, spent_on, category_id, description, paid_by, vendor, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$8) RETURNING id`,
        [eventId, amount, date, cats[cat], reason, uid, vendor, `${date}T12:00:00+05:30`],
      );
      const eid = r.rows[0].id;
      if (current || amount >= 10000) {
        const pay = await storeFile(eventId, p.year, uid, 'expense_payment', await fakeDoc('upi', vendor ?? reason, amount, date), 'payment.png');
        await pool.query(`INSERT INTO expense_proofs (expense_id, file_id, kind, created_by) VALUES ($1,$2,'payment',$3)`, [eid, pay, uid]);
        if (vendor) {
          const bill = await storeFile(eventId, p.year, uid, 'expense_bill', await fakeDoc('bill', vendor, amount, date), 'bill.png');
          await pool.query(`INSERT INTO expense_proofs (expense_id, file_id, kind, created_by) VALUES ($1,$2,'bill',$3)`, [eid, bill, uid]);
        }
      }
      await log(uid, 'create', 'expense', eid, eventId, `${by} added ${inr(amount)} expense: ${cat}, ${reason}`, date);
    }
    for (const [qty, price, date, vendor, by] of p.sareeBuys) {
      const r = await pool.query(
        `INSERT INTO saree_purchases (event_id, purchased_on, vendor, quantity, unit_price, purchased_by, created_by) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [eventId, date, vendor, qty, price, ids[by]],
      );
      await log(ids[by]!, 'create', 'saree_purchase', r.rows[0].id, eventId, `${by} recorded purchase of ${qty} sarees at ${inr(price)} each`, date);
    }
    for (const [qty, price, date, customer, by] of p.sareeSales) {
      const r = await pool.query(
        `INSERT INTO saree_sales (event_id, sold_on, customer_name, quantity, unit_price, recorded_by, created_by) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [eventId, date, customer, qty, price, ids[by]],
      );
      await log(ids[by]!, 'create', 'saree_sale', r.rows[0].id, eventId, `${by} recorded sale of ${qty} sarees to ${customer}`, date);
    }
  }
  const media = await import('./seedMedia.js');
  await media.seedMedia(ids, eventIds);
  await fs.rm(tmp, { recursive: true, force: true });
}
