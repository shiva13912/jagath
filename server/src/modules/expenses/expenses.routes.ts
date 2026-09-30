import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne, tx } from '../../db/pool.js';
import { assertOwnerOrAdmin, authenticate, requireAdmin } from '../../middleware/auth.js';
import { filesByField, uploader } from '../../middleware/upload.js';
import { body, id, isoDate, money, optionalText, queryParams, requiredText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { insertFile, storePrivate, trackUploads, type StoredFile } from '../../services/files.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { diff, inr } from '../../utils/format.js';
import { eventByYear } from '../events/events.service.js';

/** Mounted at /api. */
export const expensesRouter = Router();
expensesRouter.use(authenticate);

// Up to 5 payment screenshots and 5 bills per request.
const proofUpload = uploader(config.limits.proof, 10).fields([
  { name: 'payment', maxCount: 5 },
  { name: 'bill', maxCount: 5 },
]);

const expenseSchema = z.object({
  amount: money,
  spentOn: isoDate,
  categoryId: id,
  description: requiredText(500, 'Reason'),
  paidBy: id.optional(),
  vendor: optionalText(200),
  notes: optionalText(2000),
});

const EXPENSE_SELECT = `
  SELECT e.id, e.event_id, ev.year, e.amount, e.spent_on, e.category_id, ec.name AS category, e.description, e.vendor, e.notes,
         e.paid_by, pb.name AS paid_by_name, e.created_by, cb.name AS created_by_name, e.created_at, e.updated_at,
         ub.name AS updated_by_name,
         (SELECT COUNT(*) FROM expense_proofs p WHERE p.expense_id = e.id AND p.deleted_at IS NULL) AS proof_count
  FROM expenses e
  JOIN events ev ON ev.id = e.event_id
  JOIN expense_categories ec ON ec.id = e.category_id
  JOIN users pb ON pb.id = e.paid_by
  JOIN users cb ON cb.id = e.created_by
  LEFT JOIN users ub ON ub.id = e.updated_by`;

async function loadProofs(expenseId: number, c?: PoolClient) {
  return query(
    `SELECT p.id AS proof_id, p.kind, f.id, f.original_name, f.mime_type, f.size_bytes, p.created_at
     FROM expense_proofs p JOIN files f ON f.id = p.file_id
     WHERE p.expense_id = $1 AND p.deleted_at IS NULL ORDER BY p.kind, p.id`,
    [expenseId],
    c,
  );
}

async function attachProofs(c: PoolClient, req: any, expenseId: number, eventId: number, stored: Array<{ kind: 'payment' | 'bill'; file: StoredFile }>) {
  for (const s of stored) {
    const fileId = await insertFile(c, s.file, s.kind === 'payment' ? 'expense_payment' : 'expense_bill', eventId, req.user.id);
    await c.query('INSERT INTO expense_proofs (expense_id, file_id, kind, created_by) VALUES ($1,$2,$3,$4)', [expenseId, fileId, s.kind, req.user.id]);
  }
}

async function storeProofs(req: any, year: number, keys: string[]) {
  const map = filesByField(req);
  const stored: Array<{ kind: 'payment' | 'bill'; file: StoredFile }> = [];
  for (const kind of ['payment', 'bill'] as const) {
    for (const f of map[kind] ?? []) {
      stored.push({ kind, file: await storePrivate(f, year, keys, undefined, kind === 'payment' ? 'Payment proof' : 'Bill') });
    }
  }
  return stored;
}

async function checkCategoryAndPayer(c: PoolClient, categoryId?: number, paidBy?: number) {
  if (categoryId) {
    const cat = await queryOne('SELECT 1 FROM expense_categories WHERE id = $1 AND is_active', [categoryId], c);
    if (!cat) throw badRequest('Choose a valid category');
  }
  if (paidBy) {
    const u = await queryOne('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [paidBy], c);
    if (!u) throw badRequest('"Spent by" must be a team member');
  }
}

const SORTS: Record<string, string> = {
  date_desc: 'e.spent_on DESC, e.id DESC',
  date_asc: 'e.spent_on ASC, e.id ASC',
  amount_desc: 'e.amount DESC, e.id DESC',
  amount_asc: 'e.amount ASC, e.id ASC',
  created_desc: 'e.created_at DESC, e.id DESC',
};

expensesRouter.get('/events/:year/expenses', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const f = queryParams(
    req,
    z.object({
      q: z.string().trim().max(100).optional(),
      category: id.optional(),
      paidBy: id.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      sort: z.enum(Object.keys(SORTS) as [string, ...string[]]).default('date_desc'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  );
  const where = ['e.event_id = $1', 'e.deleted_at IS NULL'];
  const params: unknown[] = [ev.id];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where.push(`(e.description ILIKE ${p} OR e.vendor ILIKE ${p} OR pb.name ILIKE ${p})`);
  }
  if (f.category) add('e.category_id = ?', f.category);
  if (f.paidBy) add('e.paid_by = ?', f.paidBy);
  if (f.from) add('e.spent_on >= ?', f.from);
  if (f.to) add('e.spent_on <= ?', f.to);
  const whereSql = where.join(' AND ');
  const totals = await queryOne(
    `SELECT COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS sum FROM expenses e JOIN users pb ON pb.id = e.paid_by WHERE ${whereSql}`,
    params,
  );
  const items = await query(
    `${EXPENSE_SELECT} WHERE ${whereSql} ORDER BY ${SORTS[f.sort]} LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    params,
  );
  res.json({ items, total: totals!.count, sum: totals!.sum, page: f.page, pageSize: f.pageSize });
});

expensesRouter.post('/events/:year/expenses', proofUpload, async (req, res) => {
  const data = body(req, expenseSchema);
  const ev = await eventByYear(req.params.year);
  const expense = await trackUploads(req, async (keys) => {
    const stored = await storeProofs(req, ev.year, keys);
    return tx(async (c) => {
      const paidBy = data.paidBy ?? req.user!.id;
      await checkCategoryAndPayer(c, data.categoryId, paidBy);
      const row = await queryOne(
        `INSERT INTO expenses (event_id, amount, spent_on, category_id, description, paid_by, vendor, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [ev.id, data.amount, data.spentOn, data.categoryId, data.description, paidBy, data.vendor, data.notes, req.user!.id],
        c,
      );
      await attachProofs(c, req, row.id, ev.id, stored);
      const full = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1`, [row.id], c);
      await audit(req, {
        action: 'create', entityType: 'expense', entityId: row.id, eventId: ev.id,
        summary: `${full.paid_by_name === req.user!.name ? req.user!.name : `${req.user!.name} (for ${full.paid_by_name})`} added ${inr(data.amount)} expense: ${full.category}, ${data.description}${stored.length ? ` (${stored.length} proof${stored.length > 1 ? 's' : ''})` : ''}`,
      }, c);
      return { ...full, proofs: await loadProofs(row.id, c) };
    });
  });
  notifyChange('finance', ev.year);
  res.status(201).json({ expense });
});

expensesRouter.get('/expenses/:id', async (req, res) => {
  const eid = id.parse(req.params.id);
  const expense = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1 AND e.deleted_at IS NULL AND ev.deleted_at IS NULL`, [eid]);
  if (!expense) throw notFound('Expense');
  const history = await query(
    `SELECT a.action, a.summary, a.details, a.created_at, u.name AS user_name
     FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'expense' AND a.entity_id = $1 ORDER BY a.created_at, a.id`,
    [String(eid)],
  );
  res.json({ expense: { ...expense, proofs: await loadProofs(eid), history } });
});

expensesRouter.put('/expenses/:id', proofUpload, async (req, res) => {
  const eid = id.parse(req.params.id);
  const data = body(req, expenseSchema.partial());
  const result = await trackUploads(req, async (keys) => {
    const existing = await queryOne('SELECT e.*, ev.year FROM expenses e JOIN events ev ON ev.id = e.event_id WHERE e.id = $1 AND e.deleted_at IS NULL', [eid]);
    if (!existing) throw notFound('Expense');
    assertOwnerOrAdmin(req, [existing.created_by]);
    const stored = await storeProofs(req, existing.year, keys);
    return tx(async (c) => {
      const before = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1 FOR UPDATE OF e`, [eid], c);
      await checkCategoryAndPayer(c, data.categoryId, data.paidBy);
      await c.query(
        `UPDATE expenses SET amount = COALESCE($2, amount), spent_on = COALESCE($3, spent_on), category_id = COALESCE($4, category_id),
           description = COALESCE($5, description), paid_by = COALESCE($6, paid_by),
           vendor = CASE WHEN $7::boolean THEN $8 ELSE vendor END,
           notes = CASE WHEN $9::boolean THEN $10 ELSE notes END,
           updated_by = $11
         WHERE id = $1`,
        [
          eid, data.amount ?? null, data.spentOn ?? null, data.categoryId ?? null, data.description ?? null, data.paidBy ?? null,
          data.vendor !== undefined, data.vendor ?? null, data.notes !== undefined, data.notes ?? null, req.user!.id,
        ],
      );
      await attachProofs(c, req, eid, existing.event_id, stored);
      const after = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1`, [eid], c);
      const changes: Record<string, unknown> = diff(before, after, ['amount', 'spent_on', 'category', 'description', 'paid_by_name', 'vendor', 'notes']);
      if (stored.length) changes.proofs_added = stored.map((s) => `${s.kind}: ${s.file.originalName}`);
      await audit(req, {
        action: 'update', entityType: 'expense', entityId: eid, eventId: existing.event_id,
        summary: `${req.user!.name} modified expense "${before.description}"${before.amount !== after.amount ? ` (${inr(before.amount)} → ${inr(after.amount)})` : ''}${stored.length ? `, uploaded ${stored.length} proof(s)` : ''}`,
        details: changes,
      }, c);
      return { year: existing.year, expense: { ...after, proofs: await loadProofs(eid, c) } };
    });
  });
  notifyChange('finance', result.year);
  res.json({ expense: result.expense });
});

expensesRouter.delete('/expenses/:id', requireAdmin, async (req, res) => {
  const eid = id.parse(req.params.id);
  const { reason } = body(req, z.object({ reason: optionalText(500) }));
  const year = await tx(async (c) => {
    const row = await queryOne(`${EXPENSE_SELECT} WHERE e.id = $1 AND e.deleted_at IS NULL FOR UPDATE OF e`, [eid], c);
    if (!row) throw notFound('Expense');
    await c.query('UPDATE expenses SET deleted_at = now(), updated_by = $2 WHERE id = $1', [eid, req.user!.id]);
    await audit(req, {
      action: 'delete', entityType: 'expense', entityId: eid, eventId: row.event_id,
      summary: `${req.user!.name} deleted expense "${row.description}" (${inr(row.amount)}, ${row.category})`,
      details: { reason, amount: row.amount, category: row.category, spent_on: row.spent_on, paid_by: row.paid_by_name },
    }, c);
    return row.year;
  });
  notifyChange('finance', year);
  res.json({ ok: true });
});

expensesRouter.delete('/expense-proofs/:id', async (req, res) => {
  const pid = id.parse(req.params.id);
  const year = await tx(async (c) => {
    const p = await queryOne(
      `SELECT p.*, e.created_by AS expense_owner, e.event_id, ev.year, f.original_name
       FROM expense_proofs p JOIN expenses e ON e.id = p.expense_id JOIN events ev ON ev.id = e.event_id JOIN files f ON f.id = p.file_id
       WHERE p.id = $1 AND p.deleted_at IS NULL FOR UPDATE OF p`,
      [pid],
      c,
    );
    if (!p) throw notFound('Proof');
    assertOwnerOrAdmin(req, [p.expense_owner]);
    await c.query('UPDATE expense_proofs SET deleted_at = now() WHERE id = $1', [pid]);
    await audit(req, {
      action: 'delete', entityType: 'expense', entityId: p.expense_id, eventId: p.event_id,
      summary: `${req.user!.name} removed ${p.kind} proof "${p.original_name}" from an expense`,
    }, c);
    return p.year;
  });
  notifyChange('finance', year);
  res.json({ ok: true });
});

// ---- Categories ---------------------------------------------------------------

expensesRouter.get('/expense-categories', async (_req, res) => {
  res.json({ categories: await query('SELECT id, name, is_active, sort_order FROM expense_categories ORDER BY sort_order, name') });
});

expensesRouter.post('/expense-categories', requireAdmin, async (req, res) => {
  const data = body(req, z.object({ name: requiredText(60, 'Name'), sortOrder: z.coerce.number().int().min(0).max(999).default(50) }));
  const category = await tx(async (c) => {
    const row = await queryOne('INSERT INTO expense_categories (name, sort_order) VALUES ($1,$2) RETURNING *', [data.name, data.sortOrder], c);
    await audit(req, { action: 'create', entityType: 'category', entityId: row.id, summary: `${req.user!.name} added expense category "${data.name}"` }, c);
    return row;
  });
  res.status(201).json({ category });
});

expensesRouter.put('/expense-categories/:id', requireAdmin, async (req, res) => {
  const cid = id.parse(req.params.id);
  const data = body(req, z.object({ name: requiredText(60, 'Name').optional(), isActive: z.boolean().optional(), sortOrder: z.coerce.number().int().min(0).max(999).optional() }));
  const category = await tx(async (c) => {
    const before = await queryOne('SELECT * FROM expense_categories WHERE id = $1', [cid], c);
    if (!before) throw notFound('Category');
    const after = await queryOne(
      `UPDATE expense_categories SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), sort_order = COALESCE($4, sort_order)
       WHERE id = $1 RETURNING *`,
      [cid, data.name ?? null, data.isActive ?? null, data.sortOrder ?? null],
      c,
    );
    await audit(req, { action: 'update', entityType: 'category', entityId: cid, summary: `${req.user!.name} updated expense category "${after.name}"`, details: diff(before, after, ['name', 'is_active', 'sort_order']) }, c);
    return after;
  });
  notifyChange('finance');
  res.json({ category });
});
