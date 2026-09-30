import { Router } from 'express';
import { z } from 'zod';
import { queryOne, tx } from '../../db/pool.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { body, id, isoDate, money, optionalText, requiredText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { notFound } from '../../utils/errors.js';
import { diff, inr } from '../../utils/format.js';
import { eventByYear } from '../events/events.service.js';
import { dashboard } from './finance.service.js';

/** Mounted at /api. */
export const financeRouter = Router();
financeRouter.use(authenticate);

financeRouter.get('/events/:year/dashboard', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ year: ev.year, title: ev.title, ...(await dashboard(ev.id, req.user!.id)) });
});

financeRouter.put('/other-income/:id', requireAdmin, async (req, res) => {
  const oid = id.parse(req.params.id);
  const data = body(
    req,
    z.object({ amount: money.optional(), source: requiredText(200, 'Source').optional(), receivedOn: isoDate.optional(), notes: optionalText(1000) }),
  );
  const year = await tx(async (c) => {
    const before = await queryOne(
      'SELECT o.*, e.year FROM other_incomes o JOIN events e ON e.id = o.event_id WHERE o.id = $1 AND o.deleted_at IS NULL FOR UPDATE OF o',
      [oid],
      c,
    );
    if (!before) throw notFound('Income record');
    const after = await queryOne(
      `UPDATE other_incomes SET amount = COALESCE($2, amount), source = COALESCE($3, source), received_on = COALESCE($4, received_on),
         notes = CASE WHEN $5::boolean THEN $6 ELSE notes END, updated_by = $7 WHERE id = $1 RETURNING *`,
      [oid, data.amount ?? null, data.source ?? null, data.receivedOn ?? null, data.notes !== undefined, data.notes ?? null, req.user!.id],
      c,
    );
    await audit(req, {
      action: 'update', entityType: 'other_income', entityId: oid, eventId: before.event_id,
      summary: `${req.user!.name} edited income from ${after.source}`,
      details: diff(before, after, ['amount', 'source', 'received_on', 'notes']),
    }, c);
    return before.year;
  });
  notifyChange('finance', year);
  res.json({ ok: true });
});

financeRouter.delete('/other-income/:id', requireAdmin, async (req, res) => {
  const oid = id.parse(req.params.id);
  const year = await tx(async (c) => {
    const row = await queryOne(
      'SELECT o.*, e.year FROM other_incomes o JOIN events e ON e.id = o.event_id WHERE o.id = $1 AND o.deleted_at IS NULL FOR UPDATE OF o',
      [oid],
      c,
    );
    if (!row) throw notFound('Income record');
    await c.query('UPDATE other_incomes SET deleted_at = now(), updated_by = $2 WHERE id = $1', [oid, req.user!.id]);
    await audit(req, { action: 'delete', entityType: 'other_income', entityId: oid, eventId: row.event_id, summary: `${req.user!.name} deleted income of ${inr(row.amount)} from ${row.source}` }, c);
    return row.year;
  });
  notifyChange('finance', year);
  res.json({ ok: true });
});
