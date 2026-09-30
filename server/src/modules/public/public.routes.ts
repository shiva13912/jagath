import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { id, year as yearSchema } from '../../middleware/validate.js';
import { notFound } from '../../utils/errors.js';
import { contributionStatus, expensesByCategory, financeTotals, sareeSummary, yearlyTrend } from '../finance/finance.service.js';
import { PUBLIC_ALBUM_WHERE, PUBLIC_MEDIA_COLUMNS, PUBLIC_MEDIA_WHERE } from '../media/media.service.js';
import { sareeHistory } from '../sarees/sarees.routes.js';

/**
 * Read-only endpoints for the public website. No authentication.
 *
 * Rules enforced here (and tested in test/public.test.ts):
 *  - only years with is_published are visible; anything else is a 404;
 *  - every response is built from an explicit whitelist of fields;
 *  - payment screenshots, bills, uploader identities, member emails/phones
 *    (unless the member marked them public), admin notes and audit data are
 *    never selected;
 *  - optional detail (contributor names, itemised expenses, saree sales) only
 *    appears when the admin switched it on for that year.
 */
export const publicRouter = Router();

// Public data changes rarely and is safe to cache briefly at the browser/CDN.
publicRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=15');
  next();
});

const SITE_KEYS = ['site_name', 'tagline', 'about', 'contact'];
const PUBLIC_EVENT_FIELDS = `id, year, title, description, location, start_date, end_date,
  public_finance, public_contributor_names, public_expense_list, public_saree_sales`;

async function publishedEvent(raw: unknown) {
  const y = yearSchema.safeParse(raw);
  if (!y.success) throw notFound('Event');
  const ev = await queryOne(`SELECT ${PUBLIC_EVENT_FIELDS} FROM events WHERE year = $1 AND is_published AND deleted_at IS NULL`, [y.data]);
  if (!ev) throw notFound('Event');
  return ev;
}

const stripId = ({ id: _id, ...rest }: Record<string, unknown>) => rest;

publicRouter.get('/site', async (_req, res) => {
  const rows = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings WHERE key = ANY($1)', [SITE_KEYS]);
  const site: Record<string, unknown> = {};
  for (const r of rows) site[r.key] = r.value;
  const years = await query('SELECT year FROM events WHERE is_published AND deleted_at IS NULL ORDER BY year DESC');
  res.json({ site, years: years.map((y) => y.year), currentYear: years[0]?.year ?? null });
});

/** Team members who chose to appear publicly; contact details only if marked public. */
publicRouter.get('/team', async (_req, res) => {
  const team = await query(
    `SELECT name, CASE WHEN email_public THEN email END AS email, CASE WHEN phone_public THEN phone END AS phone
     FROM users WHERE is_active AND deleted_at IS NULL AND show_on_public_site ORDER BY name`,
  );
  res.json({ team });
});

publicRouter.get('/events', async (_req, res) => {
  const events = await query(
    `SELECT e.year, e.title, e.description, e.location, e.start_date, e.end_date, e.public_finance,
       (SELECT COUNT(*) FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id WHERE m.event_id = e.id AND m.type = 'photo' AND ${PUBLIC_MEDIA_WHERE}) AS photos,
       (SELECT COUNT(*) FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id WHERE m.event_id = e.id AND m.type = 'video' AND ${PUBLIC_MEDIA_WHERE}) AS videos,
       (SELECT m.id FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id WHERE m.event_id = e.id AND m.thumb_key IS NOT NULL AND ${PUBLIC_MEDIA_WHERE} ORDER BY m.is_featured DESC, m.created_at LIMIT 1) AS cover_id
     FROM events e WHERE e.is_published AND e.deleted_at IS NULL ORDER BY e.year DESC`,
  );
  const trend = new Map((await yearlyTrend(true)).map((t) => [t.year, t]));
  res.json({
    events: events.map((e) => ({
      ...e,
      finance: e.public_finance ? { income: trend.get(e.year)?.income ?? 0, expenses: trend.get(e.year)?.expenses ?? 0, balance: trend.get(e.year)?.balance ?? 0 } : null,
    })),
  });
});

publicRouter.get('/events/:year', async (req, res) => {
  const ev = await publishedEvent(req.params.year);
  const counts = await queryOne(
    `SELECT COUNT(*) FILTER (WHERE m.type = 'photo') AS photos, COUNT(*) FILTER (WHERE m.type = 'video') AS videos
     FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id WHERE m.event_id = $1 AND ${PUBLIC_MEDIA_WHERE}`,
    [ev.id],
  );
  res.json({ event: stripId(ev), counts });
});

publicRouter.get('/events/:year/finance', async (req, res) => {
  const ev = await publishedEvent(req.params.year);
  if (!ev.public_finance) return res.json({ year: ev.year, available: false });
  const [totals, byCategory, status] = await Promise.all([financeTotals(ev.id), expensesByCategory(ev.id), contributionStatus(ev.id)]);
  const contributors = {
    members: status.length,
    contributed: status.filter((s) => s.paid > 0).length,
    paid: status.filter((s) => s.status === 'paid').length,
    partial: status.filter((s) => s.status === 'partial').length,
    pending: status.filter((s) => s.status === 'pending').length,
    // Individual names/amounts only when the admin enabled it for this year,
    // and only for members who agreed to appear publicly.
    list: ev.public_contributor_names
      ? status
          .filter((s) => s.paid > 0)
          .map((s) => ({ name: s.show_on_public_site ? s.name : 'A team member', amount: s.paid, status: s.status }))
          .sort((a, b) => b.amount - a.amount)
      : null,
  };
  const expenses = ev.public_expense_list
    ? await query(
        `SELECT e.spent_on, ec.name AS category, e.description, e.amount
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.event_id = $1 AND e.deleted_at IS NULL ORDER BY e.spent_on DESC, e.id DESC`,
        [ev.id],
      )
    : null;
  const { budgetUsedPct: _p, ...publicTotals } = totals;
  res.json({ year: ev.year, title: ev.title, available: true, totals: publicTotals, byCategory, contributors, expenses, trend: await yearlyTrend(true) });
});

publicRouter.get('/events/:year/sarees', async (req, res) => {
  const ev = await publishedEvent(req.params.year);
  const summary = await sareeSummary(ev.id);
  // Customer names are personal data: the public list shows only date, quantity and price.
  const sales = ev.public_saree_sales
    ? await query(
        `SELECT sold_on, quantity, unit_price, total_amount FROM saree_sales WHERE event_id = $1 AND deleted_at IS NULL ORDER BY sold_on DESC, id DESC`,
        [ev.id],
      )
    : null;
  const history = await sareeHistory(true);
  res.json({
    year: ev.year,
    summary: { purchased: summary.purchased, sold: summary.sold, remaining: summary.remaining, ...(ev.public_finance ? { purchaseCost: summary.purchaseCost, salesRevenue: summary.salesRevenue } : {}) },
    sales,
    history: history.map((h) => ({ year: h.year, purchased: h.purchased, sold: h.sold, remaining: h.remaining })),
  });
});

publicRouter.get('/events/:year/gallery', async (req, res) => {
  const ev = await publishedEvent(req.params.year);
  const albums = await query(
    `SELECT a.id, a.name, a.description,
       COUNT(m.id) FILTER (WHERE m.type = 'photo') AS photo_count,
       COUNT(m.id) FILTER (WHERE m.type = 'video') AS video_count,
       COALESCE(
         (SELECT c.id FROM media c WHERE c.id = a.cover_media_id AND c.is_public AND c.deleted_at IS NULL),
         (SELECT x.id FROM media x WHERE x.album_id = a.id AND x.is_public AND x.deleted_at IS NULL AND x.thumb_key IS NOT NULL ORDER BY x.is_featured DESC, x.created_at LIMIT 1)
       ) AS cover_id
     FROM albums a JOIN events ev ON ev.id = a.event_id
     LEFT JOIN media m ON m.album_id = a.id AND m.is_public AND m.deleted_at IS NULL
     WHERE a.event_id = $1 AND ${PUBLIC_ALBUM_WHERE}
     GROUP BY a.id HAVING COUNT(m.id) > 0 ORDER BY a.sort_order, a.created_at`,
    [ev.id],
  );
  res.json({ year: ev.year, albums });
});

publicRouter.get('/albums/:id', async (req, res) => {
  const aid = id.safeParse(req.params.id);
  if (!aid.success) throw notFound('Album');
  const album = await queryOne(
    `SELECT a.id, a.name, a.description, ev.year FROM albums a JOIN events ev ON ev.id = a.event_id WHERE a.id = $1 AND ${PUBLIC_ALBUM_WHERE}`,
    [aid.data],
  );
  if (!album) throw notFound('Album');
  const items = await query(
    `SELECT ${PUBLIC_MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id
     WHERE m.album_id = $1 AND ${PUBLIC_MEDIA_WHERE} ORDER BY m.created_at, m.id`,
    [aid.data],
  );
  res.json({ album, items });
});

publicRouter.get('/events/:year/videos', async (req, res) => {
  const ev = await publishedEvent(req.params.year);
  const items = await query(
    `SELECT ${PUBLIC_MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id
     WHERE m.event_id = $1 AND m.type = 'video' AND ${PUBLIC_MEDIA_WHERE} ORDER BY m.is_featured DESC, m.created_at DESC`,
    [ev.id],
  );
  res.json({ year: ev.year, items });
});

/** Featured media for the home page (falls back to the latest if none are featured). */
publicRouter.get('/featured', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(24).default(8) }).parse(req.query);
  const photos = await query(
    `SELECT ${PUBLIC_MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id
     WHERE m.type = 'photo' AND m.thumb_key IS NOT NULL AND ${PUBLIC_MEDIA_WHERE}
     ORDER BY m.is_featured DESC, ev.year DESC, m.created_at DESC LIMIT $1`,
    [limit],
  );
  const videos = await query(
    `SELECT ${PUBLIC_MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id
     WHERE m.type = 'video' AND ${PUBLIC_MEDIA_WHERE}
     ORDER BY m.is_featured DESC, ev.year DESC, m.created_at DESC LIMIT 3`,
  );
  res.json({ photos, videos });
});
