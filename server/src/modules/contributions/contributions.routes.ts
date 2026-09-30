import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne, tx } from '../../db/pool.js';
import { assertOwnerOrAdmin, authenticate, isAdmin, requireAdmin } from '../../middleware/auth.js';
import { uploader } from '../../middleware/upload.js';
import { body, boolish, id, isoDate, money, optionalText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { FILE_JSON, insertFile, storePrivate, trackUploads } from '../../services/files.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { diff, inr } from '../../utils/format.js';
import { ensureOnRoster, eventByYear } from '../events/events.service.js';
import { contributionStatus, summarizeContributions } from '../finance/finance.service.js';

/** Mounted at /api: routes are /events/:year/contributions and /contributions/:id */
export const contributionsRouter = Router();
contributionsRouter.use(authenticate);

const proofUpload = uploader(config.limits.proof, 1).single('proof');

const createSchema = z.object({
  userId: id.optional(),
  amount: money,
  paidOn: isoDate,
  method: z.enum(['upi', 'cash', 'bank', 'other']).optional().nullable().or(z.literal('').transform(() => null)),
  reference: optionalText(120),
  notes: optionalText(1000),
});

const PAYMENT_SELECT = `
  SELECT co.id, co.user_id, u.name AS member_name, co.amount, co.paid_on, co.method, co.reference, co.notes,
         co.created_by, cb.name AS created_by_name, co.created_at, co.updated_at,
         ${FILE_JSON('f')} AS proof
  FROM contributions co
  JOIN users u ON u.id = co.user_id
  JOIN users cb ON cb.id = co.created_by
  LEFT JOIN files f ON f.id = co.proof_file_id`;

contributionsRouter.get('/events/:year/contributions', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const rows = await contributionStatus(ev.id);
  const payments = await query(`${PAYMENT_SELECT} WHERE co.event_id = $1 AND co.deleted_at IS NULL ORDER BY co.paid_on DESC, co.id DESC`, [ev.id]);
  res.json({ summary: summarizeContributions(rows), rows: rows.map(({ show_on_public_site: _s, ...r }) => r), payments });
});

contributionsRouter.post('/events/:year/contributions', proofUpload, async (req, res) => {
  const data = body(req, createSchema);
  const ev = await eventByYear(req.params.year);
  // Members can only record their own payment. Admins can record for anyone.
  const memberId = isAdmin(req) ? (data.userId ?? req.user!.id) : req.user!.id;
  if (!isAdmin(req) && data.userId && data.userId !== req.user!.id) throw forbidden('You can only add your own contribution');

  const payment = await trackUploads(req, async (keys) => {
    const stored = req.file ? await storePrivate(req.file, ev.year, keys, undefined, 'Payment proof') : null;
    return tx(async (c) => {
      const member = await queryOne('SELECT id, name FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL', [memberId], c);
      if (!member) throw badRequest('Member not found or inactive');
      await ensureOnRoster(ev.id, memberId, c);
      const fileId = stored ? await insertFile(c, stored, 'contribution_proof', ev.id, req.user!.id) : null;
      const row = await queryOne(
        `INSERT INTO contributions (event_id, user_id, amount, paid_on, method, reference, notes, proof_file_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [ev.id, memberId, data.amount, data.paidOn, data.method ?? null, data.reference, data.notes, fileId, req.user!.id],
        c,
      );
      const who = memberId === req.user!.id ? req.user!.name : `${req.user!.name} (for ${member.name})`;
      await audit(req, {
        action: 'create', entityType: 'contribution', entityId: row.id, eventId: ev.id,
        summary: `${who} added a contribution of ${inr(data.amount)}${fileId ? ' with proof' : ''}`,
      }, c);
      return queryOne(`${PAYMENT_SELECT} WHERE co.id = $1`, [row.id], c);
    });
  });
  notifyChange('finance', ev.year);
  res.status(201).json({ payment });
});

contributionsRouter.put('/contributions/:id', proofUpload, async (req, res) => {
  const cid = id.parse(req.params.id);
  const data = body(req, createSchema.partial().omit({ userId: true }).extend({ removeProof: boolish.optional() }));
  const result = await trackUploads(req, async (keys) => {
    const existing = await queryOne(
      `SELECT co.*, e.year FROM contributions co JOIN events e ON e.id = co.event_id WHERE co.id = $1 AND co.deleted_at IS NULL`,
      [cid],
    );
    if (!existing) throw notFound('Contribution');
    assertOwnerOrAdmin(req, [existing.created_by, existing.user_id]);
    const stored = req.file ? await storePrivate(req.file, existing.year, keys, undefined, 'Payment proof') : null;
    return tx(async (c) => {
      const before = await queryOne('SELECT * FROM contributions WHERE id = $1 FOR UPDATE', [cid], c);
      let fileId = before.proof_file_id;
      if (stored) fileId = await insertFile(c, stored, 'contribution_proof', before.event_id, req.user!.id);
      else if (data.removeProof) fileId = null;
      const after = await queryOne(
        `UPDATE contributions SET amount = COALESCE($2, amount), paid_on = COALESCE($3, paid_on),
           method = CASE WHEN $4::boolean THEN $5 ELSE method END,
           reference = CASE WHEN $6::boolean THEN $7 ELSE reference END,
           notes = CASE WHEN $8::boolean THEN $9 ELSE notes END,
           proof_file_id = $10, updated_by = $11
         WHERE id = $1 RETURNING *`,
        [
          cid, data.amount ?? null, data.paidOn ?? null,
          data.method !== undefined, data.method ?? null,
          data.reference !== undefined, data.reference ?? null,
          data.notes !== undefined, data.notes ?? null,
          fileId, req.user!.id,
        ],
        c,
      );
      const changes = diff(before, after, ['amount', 'paid_on', 'method', 'reference', 'notes', 'proof_file_id']);
      await audit(req, {
        action: 'update', entityType: 'contribution', entityId: cid, eventId: before.event_id,
        summary: `${req.user!.name} edited a contribution (${inr(before.amount)}${after.amount !== before.amount ? ` → ${inr(after.amount)}` : ''})`,
        details: changes,
      }, c);
      return { year: existing.year, payment: await queryOne(`${PAYMENT_SELECT} WHERE co.id = $1`, [cid], c) };
    });
  });
  notifyChange('finance', result.year);
  res.json({ payment: result.payment });
});

/** Soft delete: the row stays for the audit trail but no longer counts. */
contributionsRouter.delete('/contributions/:id', requireAdmin, async (req, res) => {
  const cid = id.parse(req.params.id);
  const { reason } = body(req, z.object({ reason: optionalText(500) }));
  const year = await tx(async (c) => {
    const row = await queryOne(
      `SELECT co.*, e.year, u.name AS member_name FROM contributions co JOIN events e ON e.id = co.event_id JOIN users u ON u.id = co.user_id
       WHERE co.id = $1 AND co.deleted_at IS NULL FOR UPDATE OF co`,
      [cid],
      c,
    );
    if (!row) throw notFound('Contribution');
    await c.query('UPDATE contributions SET deleted_at = now(), updated_by = $2 WHERE id = $1', [cid, req.user!.id]);
    await audit(req, {
      action: 'delete', entityType: 'contribution', entityId: cid, eventId: row.event_id,
      summary: `${req.user!.name} deleted ${row.member_name}'s contribution of ${inr(row.amount)}`,
      details: { reason, amount: row.amount, paid_on: row.paid_on },
    }, c);
    return row.year;
  });
  notifyChange('finance', year);
  res.json({ ok: true });
});
