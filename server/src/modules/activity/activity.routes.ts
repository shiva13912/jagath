import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { authenticate, isAdmin } from '../../middleware/auth.js';
import { id, queryParams, year } from '../../middleware/validate.js';

/**
 * Audit log. Read-only by design: there are no write routes here, and the
 * database itself rejects UPDATE/DELETE on activity_logs.
 *
 * Admins get the full log with filters, IPs and before/after details.
 * Team members get a limited feed: event activity only (no logins, no member
 * administration), with summaries but no IPs or diffs.
 */
export const activityRouter = Router();
activityRouter.use(authenticate);

const TEAM_VISIBLE = ['contribution', 'expense', 'other_income', 'budget', 'saree_purchase', 'saree_sale', 'album', 'media', 'event'];

activityRouter.get('/', async (req, res) => {
  const f = queryParams(
    req,
    z.object({
      year: year.optional(),
      entity: z.string().max(40).optional(),
      userId: id.optional(),
      action: z.string().max(40).optional(),
      q: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }),
  );
  const admin = isAdmin(req);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sqlFn: (p: string) => string, v: unknown) => {
    params.push(v);
    where.push(sqlFn(`$${params.length}`));
  };
  if (!admin) add((p) => `a.entity_type = ANY(${p})`, TEAM_VISIBLE);
  if (f.year) add((p) => `e.year = ${p}`, f.year);
  if (f.entity) add((p) => `a.entity_type = ${p}`, f.entity);
  if (admin && f.userId) add((p) => `a.user_id = ${p}`, f.userId);
  if (f.action) add((p) => `a.action = ${p}`, f.action);
  if (f.q) add((p) => `a.summary ILIKE ${p}`, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN events e ON e.id = a.event_id ${whereSql}`;
  const total = (await queryOne(`SELECT COUNT(*) AS n ${from}`, params))!.n;
  const cols = admin
    ? 'a.id, a.action, a.entity_type, a.entity_id, a.summary, a.details, a.ip, a.created_at, u.name AS user_name, a.user_id, e.year'
    : 'a.id, a.action, a.entity_type, a.summary, a.created_at, u.name AS user_name, e.year';
  const items = await query(`SELECT ${cols} ${from} ORDER BY a.created_at DESC, a.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`, params);
  res.json({ items, total, page: f.page, pageSize: f.pageSize, limited: !admin });
});
