import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, tx } from '../../db/pool.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { body, boolish, id, isoDate, money, nonNegativeMoney, optionalText, requiredText, year } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { diff, inr } from '../../utils/format.js';
import { yearlyTrend } from '../finance/finance.service.js';
import { EVENT_FIELDS, eventByYear } from './events.service.js';

export const eventsRouter = Router();
eventsRouter.use(authenticate);

const optionalDate = isoDate.optional().nullable().or(z.literal('').transform(() => null));

const eventFields = {
  title: requiredText(200, 'Title'),
  description: optionalText(5000),
  location: optionalText(300),
  startDate: optionalDate,
  endDate: optionalDate,
  defaultExpectedContribution: nonNegativeMoney.optional(),
  isPublished: boolish.optional(),
  publicFinance: boolish.optional(),
  publicContributorNames: boolish.optional(),
  publicExpenseList: boolish.optional(),
  publicSareeSales: boolish.optional(),
};

eventsRouter.get('/', async (_req, res) => {
  const events = await query(`SELECT ${EVENT_FIELDS} FROM events WHERE deleted_at IS NULL ORDER BY year DESC`);
  res.json({ events });
});

/** Income vs expenses for every year: feeds the "yearly trend" chart. */
eventsRouter.get('/trend', async (_req, res) => {
  res.json({ trend: await yearlyTrend(false) });
});

eventsRouter.get('/:year', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  res.json({ event: await queryOne(`SELECT ${EVENT_FIELDS} FROM events WHERE id = $1`, [ev.id]) });
});

eventsRouter.post('/', requireAdmin, async (req, res) => {
  const data = body(
    req,
    z.object({
      year,
      ...eventFields,
      budget: nonNegativeMoney.optional(),
      addAllMembers: boolish.default(true),
    }),
  );
  const dup = await queryOne('SELECT 1 FROM events WHERE year = $1 AND deleted_at IS NULL', [data.year]);
  if (dup) throw conflict(`Event ${data.year} already exists`);
  const event = await tx(async (c) => {
    const ev = await queryOne(
      `INSERT INTO events (year, title, description, location, start_date, end_date, default_expected_contribution,
         is_published, public_finance, public_contributor_names, public_expense_list, public_saree_sales, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,0),COALESCE($8,FALSE),COALESCE($9,TRUE),COALESCE($10,FALSE),COALESCE($11,FALSE),COALESCE($12,FALSE),$13)
       RETURNING ${EVENT_FIELDS}`,
      [
        data.year, data.title, data.description, data.location, data.startDate ?? null, data.endDate ?? null,
        data.defaultExpectedContribution ?? null, data.isPublished ?? null, data.publicFinance ?? null,
        data.publicContributorNames ?? null, data.publicExpenseList ?? null, data.publicSareeSales ?? null, req.user!.id,
      ],
      c,
    );
    await c.query('INSERT INTO budgets (event_id, planned_amount, updated_by) VALUES ($1, $2, $3)', [ev.id, data.budget ?? 0, req.user!.id]);
    if (data.addAllMembers) {
      await c.query(
        `INSERT INTO event_members (event_id, user_id, expected_amount)
         SELECT $1, id, $2 FROM users WHERE is_active AND deleted_at IS NULL`,
        [ev.id, ev.default_expected_contribution],
      );
    }
    await audit(req, { action: 'create', entityType: 'event', entityId: ev.id, eventId: ev.id, summary: `${req.user!.name} created event ${ev.year}` }, c);
    return ev;
  });
  notifyChange('events', event.year);
  res.status(201).json({ event });
});

eventsRouter.put('/:year', requireAdmin, async (req, res) => {
  const data = body(req, z.object({ ...eventFields, title: eventFields.title.optional() }));
  const event = await tx(async (c) => {
    const before = await eventByYear(req.params.year, c, true);
    const full = await queryOne(`SELECT ${EVENT_FIELDS} FROM events WHERE id = $1`, [before.id], c);
    const set = (v: unknown) => v !== undefined;
    const after = await queryOne(
      `UPDATE events SET
         title = COALESCE($2, title),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         location = CASE WHEN $5::boolean THEN $6 ELSE location END,
         start_date = CASE WHEN $7::boolean THEN $8::date ELSE start_date END,
         end_date = CASE WHEN $9::boolean THEN $10::date ELSE end_date END,
         default_expected_contribution = COALESCE($11, default_expected_contribution),
         is_published = COALESCE($12, is_published),
         public_finance = COALESCE($13, public_finance),
         public_contributor_names = COALESCE($14, public_contributor_names),
         public_expense_list = COALESCE($15, public_expense_list),
         public_saree_sales = COALESCE($16, public_saree_sales)
       WHERE id = $1 RETURNING ${EVENT_FIELDS}`,
      [
        before.id, data.title ?? null,
        set(data.description), data.description ?? null,
        set(data.location), data.location ?? null,
        set(data.startDate), data.startDate ?? null,
        set(data.endDate), data.endDate ?? null,
        data.defaultExpectedContribution ?? null, data.isPublished ?? null, data.publicFinance ?? null,
        data.publicContributorNames ?? null, data.publicExpenseList ?? null, data.publicSareeSales ?? null,
      ],
      c,
    );
    const changes = diff(full, after, [
      'title', 'description', 'location', 'start_date', 'end_date', 'default_expected_contribution',
      'is_published', 'public_finance', 'public_contributor_names', 'public_expense_list', 'public_saree_sales',
    ]);
    await audit(req, { action: 'update', entityType: 'event', entityId: before.id, eventId: before.id, summary: `${req.user!.name} updated event ${before.year}`, details: changes }, c);
    return after;
  });
  notifyChange('events', event.year);
  res.json({ event });
});

/** Archives a year (soft delete). Its records stay in the database. Admin only. */
eventsRouter.delete('/:year', requireAdmin, async (req, res) => {
  const { confirm } = body(req, z.object({ confirm: z.coerce.number() }));
  const ev = await eventByYear(req.params.year);
  if (confirm !== ev.year) throw badRequest(`Type the year (${ev.year}) to confirm`);
  await tx(async (c) => {
    await c.query('UPDATE events SET deleted_at = now() WHERE id = $1', [ev.id]);
    await audit(req, { action: 'delete', entityType: 'event', entityId: ev.id, eventId: ev.id, summary: `${req.user!.name} archived event ${ev.year}` }, c);
  });
  notifyChange('events', ev.year);
  res.json({ ok: true });
});

// ---- Roster: who is expected to contribute and how much ---------------------

eventsRouter.get('/:year/roster', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const rows = await query(
    `SELECT u.id AS user_id, u.name, u.is_active, em.expected_amount,
            (em.user_id IS NOT NULL) AS on_roster
     FROM users u
     LEFT JOIN event_members em ON em.user_id = u.id AND em.event_id = $1
     WHERE u.deleted_at IS NULL AND (u.is_active OR em.user_id IS NOT NULL)
     ORDER BY on_roster DESC, u.name`,
    [ev.id],
  );
  res.json({ roster: rows, defaultExpected: ev.default_expected_contribution });
});

eventsRouter.put('/:year/roster', requireAdmin, async (req, res) => {
  const { members } = body(
    req,
    z.object({
      members: z.array(z.object({ userId: id, expected: nonNegativeMoney, onRoster: z.boolean().default(true) })).max(500),
    }),
  );
  const ev = await eventByYear(req.params.year);
  await tx(async (c) => {
    const changes: string[] = [];
    for (const m of members) {
      if (m.onRoster) {
        const prev = await queryOne('SELECT expected_amount FROM event_members WHERE event_id = $1 AND user_id = $2', [ev.id, m.userId], c);
        await c.query(
          `INSERT INTO event_members (event_id, user_id, expected_amount) VALUES ($1,$2,$3)
           ON CONFLICT (event_id, user_id) DO UPDATE SET expected_amount = EXCLUDED.expected_amount`,
          [ev.id, m.userId, m.expected],
        );
        if (!prev || prev.expected_amount !== m.expected) changes.push(`${m.userId}: ${prev ? inr(prev.expected_amount) : 'new'} → ${inr(m.expected)}`);
      } else {
        const paid = await queryOne(
          'SELECT 1 FROM contributions WHERE event_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1',
          [ev.id, m.userId],
          c,
        );
        if (paid) throw badRequest('A member who has already paid cannot be removed from the roster');
        const del = await c.query('DELETE FROM event_members WHERE event_id = $1 AND user_id = $2', [ev.id, m.userId]);
        if (del.rowCount) changes.push(`${m.userId}: removed`);
      }
    }
    if (changes.length) {
      await audit(req, { action: 'update', entityType: 'roster', entityId: ev.id, eventId: ev.id, summary: `${req.user!.name} updated the ${ev.year} contribution roster`, details: { changes } }, c);
    }
  });
  notifyChange('finance', ev.year);
  res.json({ ok: true });
});

// ---- Budget -------------------------------------------------------------------

eventsRouter.get('/:year/budget', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const budget = await queryOne(
    `SELECT b.planned_amount, b.notes, b.updated_at, u.name AS updated_by_name
     FROM budgets b LEFT JOIN users u ON u.id = b.updated_by WHERE b.event_id = $1`,
    [ev.id],
  );
  res.json({ budget: budget ?? { planned_amount: 0, notes: null } });
});

eventsRouter.put('/:year/budget', requireAdmin, async (req, res) => {
  const data = body(req, z.object({ plannedAmount: nonNegativeMoney, notes: optionalText(2000) }));
  const ev = await eventByYear(req.params.year);
  await tx(async (c) => {
    const before = await queryOne('SELECT planned_amount, notes FROM budgets WHERE event_id = $1', [ev.id], c);
    await c.query(
      `INSERT INTO budgets (event_id, planned_amount, notes, updated_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (event_id) DO UPDATE SET planned_amount = EXCLUDED.planned_amount, notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by`,
      [ev.id, data.plannedAmount, data.notes, req.user!.id],
    );
    await audit(req, {
      action: 'update', entityType: 'budget', entityId: ev.id, eventId: ev.id,
      summary: `${req.user!.name} set the ${ev.year} budget to ${inr(data.plannedAmount)}`,
      details: diff(before ?? {}, { planned_amount: data.plannedAmount, notes: data.notes }, ['planned_amount', 'notes']),
    }, c);
  });
  notifyChange('finance', ev.year);
  res.json({ ok: true });
});

// ---- Other income (sponsors, outside donations) --------------------------------

const incomeSchema = z.object({
  amount: money,
  source: requiredText(200, 'Source'),
  receivedOn: isoDate,
  notes: optionalText(1000),
});

eventsRouter.get('/:year/other-income', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const items = await query(
    `SELECT o.id, o.amount, o.source, o.received_on, o.notes, o.created_at, u.name AS created_by_name
     FROM other_incomes o JOIN users u ON u.id = o.created_by
     WHERE o.event_id = $1 AND o.deleted_at IS NULL ORDER BY o.received_on DESC, o.id DESC`,
    [ev.id],
  );
  res.json({ items });
});

eventsRouter.post('/:year/other-income', requireAdmin, async (req, res) => {
  const data = body(req, incomeSchema);
  const ev = await eventByYear(req.params.year);
  const item = await tx(async (c) => {
    const row = await queryOne(
      `INSERT INTO other_incomes (event_id, amount, source, received_on, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ev.id, data.amount, data.source, data.receivedOn, data.notes, req.user!.id],
      c,
    );
    await audit(req, { action: 'create', entityType: 'other_income', entityId: row.id, eventId: ev.id, summary: `${req.user!.name} recorded ${inr(data.amount)} income from ${data.source}` }, c);
    return row;
  });
  notifyChange('finance', ev.year);
  res.status(201).json({ item });
});
