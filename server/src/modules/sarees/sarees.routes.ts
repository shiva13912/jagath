import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne, tx } from '../../db/pool.js';
import { assertOwnerOrAdmin, authenticate, requireAdmin } from '../../middleware/auth.js';
import { filesByField, PHOTO_TYPES, PROOF_TYPES, uploader } from '../../middleware/upload.js';
import { body, id, isoDate, nonNegativeMoney, optionalText, requiredText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { FILE_JSON, insertFile, storePrivate, trackUploads } from '../../services/files.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { diff, inr } from '../../utils/format.js';
import { eventByYear } from '../events/events.service.js';
import { sareeSummary } from '../finance/finance.service.js';

/**
 * Saree purchases and sales. Remaining stock = purchased - sold, always
 * computed. Every write that could change stock locks the event row first, so
 * two people recording sales at the same moment cannot oversell.
 */
export const sareesRouter = Router();
sareesRouter.use(authenticate);

const upload = uploader(config.limits.proof, 2).fields([
  { name: 'bill', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]);

const qty = z.coerce.number({ error: 'Enter a quantity' }).int('Whole sarees only').positive('Quantity must be at least 1').max(100000);

const purchaseSchema = z.object({
  purchasedOn: isoDate,
  vendor: optionalText(200),
  quantity: qty,
  unitPrice: nonNegativeMoney,
  purchasedBy: id.optional(),
  notes: optionalText(1000),
});
const saleSchema = z.object({
  soldOn: isoDate,
  customerName: requiredText(200, 'Customer name'),
  quantity: qty,
  unitPrice: nonNegativeMoney,
  notes: optionalText(1000),
});

const PURCHASE_SELECT = `
  SELECT p.id, p.purchased_on, p.vendor, p.quantity, p.unit_price, p.total_amount, p.purchased_by, u.name AS purchased_by_name,
         p.notes, p.created_by, p.created_at, ${FILE_JSON('bf')} AS proof, ${FILE_JSON('pf')} AS photo
  FROM saree_purchases p
  LEFT JOIN users u ON u.id = p.purchased_by
  LEFT JOIN files bf ON bf.id = p.proof_file_id
  LEFT JOIN files pf ON pf.id = p.photo_file_id`;
const SALE_SELECT = `
  SELECT s.id, s.sold_on, s.customer_name, s.quantity, s.unit_price, s.total_amount, s.recorded_by, u.name AS recorded_by_name,
         s.notes, s.created_by, s.created_at, ${FILE_JSON('pf')} AS photo
  FROM saree_sales s
  JOIN users u ON u.id = s.recorded_by
  LEFT JOIN files pf ON pf.id = s.photo_file_id`;

async function remaining(eventId: number, c: PoolClient) {
  return (await sareeSummary(eventId, c)).remaining;
}

async function storeSareeFiles(req: any, year: number, keys: string[]) {
  const map = filesByField(req);
  const bill = map.bill?.[0] ? await storePrivate(map.bill[0], year, keys, PROOF_TYPES, 'Bill') : null;
  const photo = map.photo?.[0] ? await storePrivate(map.photo[0], year, keys, PHOTO_TYPES, 'Photo') : null;
  return { bill, photo };
}

sareesRouter.get('/events/:year/sarees', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const [summary, purchases, sales] = await Promise.all([
    sareeSummary(ev.id),
    query(`${PURCHASE_SELECT} WHERE p.event_id = $1 AND p.deleted_at IS NULL ORDER BY p.purchased_on DESC, p.id DESC`, [ev.id]),
    query(`${SALE_SELECT} WHERE s.event_id = $1 AND s.deleted_at IS NULL ORDER BY s.sold_on DESC, s.id DESC`, [ev.id]),
  ]);
  res.json({ summary, purchases, sales });
});

/** Year-by-year saree report. */
sareesRouter.get('/sarees/history', async (_req, res) => {
  res.json({ history: await sareeHistory(false) });
});

export async function sareeHistory(publishedOnly: boolean) {
  return query(
    `SELECT e.year,
       COALESCE(p.qty, 0) AS purchased, COALESCE(p.cost, 0) AS purchase_cost,
       COALESCE(s.qty, 0) AS sold, COALESCE(s.revenue, 0) AS sales_revenue,
       COALESCE(p.qty, 0) - COALESCE(s.qty, 0) AS remaining
     FROM events e
     LEFT JOIN (SELECT event_id, SUM(quantity) qty, SUM(total_amount) cost FROM saree_purchases WHERE deleted_at IS NULL GROUP BY event_id) p ON p.event_id = e.id
     LEFT JOIN (SELECT event_id, SUM(quantity) qty, SUM(total_amount) revenue FROM saree_sales WHERE deleted_at IS NULL GROUP BY event_id) s ON s.event_id = e.id
     WHERE e.deleted_at IS NULL ${publishedOnly ? 'AND e.is_published' : ''}
     ORDER BY e.year DESC`,
  );
}

sareesRouter.post('/events/:year/sarees/purchases', upload, async (req, res) => {
  const data = body(req, purchaseSchema);
  const ev = await eventByYear(req.params.year);
  const purchase = await trackUploads(req, async (keys) => {
    const files = await storeSareeFiles(req, ev.year, keys);
    return tx(async (c) => {
      await eventByYear(ev.year, c, true);
      const billId = files.bill ? await insertFile(c, files.bill, 'saree_bill', ev.id, req.user!.id) : null;
      const photoId = files.photo ? await insertFile(c, files.photo, 'saree_photo', ev.id, req.user!.id) : null;
      const row = await queryOne(
        `INSERT INTO saree_purchases (event_id, purchased_on, vendor, quantity, unit_price, purchased_by, proof_file_id, photo_file_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, total_amount`,
        [ev.id, data.purchasedOn, data.vendor, data.quantity, data.unitPrice, data.purchasedBy ?? req.user!.id, billId, photoId, data.notes, req.user!.id],
        c,
      );
      await audit(req, {
        action: 'create', entityType: 'saree_purchase', entityId: row.id, eventId: ev.id,
        summary: `${req.user!.name} recorded purchase of ${data.quantity} sarees at ${inr(data.unitPrice)} each (${inr(row.total_amount)})`,
      }, c);
      return queryOne(`${PURCHASE_SELECT} WHERE p.id = $1`, [row.id], c);
    });
  });
  notifyChange('finance', ev.year);
  res.status(201).json({ purchase });
});

sareesRouter.post('/events/:year/sarees/sales', upload, async (req, res) => {
  const data = body(req, saleSchema);
  const ev = await eventByYear(req.params.year);
  const sale = await trackUploads(req, async (keys) => {
    const files = await storeSareeFiles(req, ev.year, keys);
    return tx(async (c) => {
      await eventByYear(ev.year, c, true); // lock: serialises stock checks for this year
      const left = await remaining(ev.id, c);
      if (data.quantity > left) throw badRequest(`Only ${left} saree${left === 1 ? '' : 's'} left in stock for ${ev.year}`);
      const photoId = files.photo ? await insertFile(c, files.photo, 'saree_photo', ev.id, req.user!.id) : null;
      const row = await queryOne(
        `INSERT INTO saree_sales (event_id, sold_on, customer_name, quantity, unit_price, recorded_by, photo_file_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6) RETURNING id, total_amount`,
        [ev.id, data.soldOn, data.customerName, data.quantity, data.unitPrice, req.user!.id, photoId, data.notes],
        c,
      );
      await audit(req, {
        action: 'create', entityType: 'saree_sale', entityId: row.id, eventId: ev.id,
        summary: `${req.user!.name} recorded sale of ${data.quantity} saree${data.quantity > 1 ? 's' : ''} to ${data.customerName} (${inr(row.total_amount)})`,
      }, c);
      return queryOne(`${SALE_SELECT} WHERE s.id = $1`, [row.id], c);
    });
  });
  notifyChange('finance', ev.year);
  res.status(201).json({ sale });
});

type Kind = 'purchase' | 'sale';
const TABLE: Record<Kind, string> = { purchase: 'saree_purchases', sale: 'saree_sales' };

async function loadForChange(kind: Kind, rid: number, c: PoolClient) {
  const row = await queryOne(
    `SELECT r.*, e.year FROM ${TABLE[kind]} r JOIN events e ON e.id = r.event_id WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [rid],
    c,
  );
  if (!row) throw notFound(kind === 'purchase' ? 'Purchase' : 'Sale');
  await eventByYear(row.year, c, true);
  return row;
}

sareesRouter.put('/saree-purchases/:id', upload, async (req, res) => {
  const rid = id.parse(req.params.id);
  const data = body(req, purchaseSchema.partial());
  const result = await trackUploads(req, async (keys) => {
    const pre = await queryOne('SELECT created_by, purchased_by, event_id FROM saree_purchases WHERE id = $1 AND deleted_at IS NULL', [rid]);
    if (!pre) throw notFound('Purchase');
    assertOwnerOrAdmin(req, [pre.created_by]);
    const year = (await queryOne('SELECT year FROM events WHERE id = $1', [pre.event_id]))!.year;
    const files = await storeSareeFiles(req, year, keys);
    return tx(async (c) => {
      const before = await loadForChange('purchase', rid, c);
      const billId = files.bill ? await insertFile(c, files.bill, 'saree_bill', before.event_id, req.user!.id) : before.proof_file_id;
      const photoId = files.photo ? await insertFile(c, files.photo, 'saree_photo', before.event_id, req.user!.id) : before.photo_file_id;
      const after = await queryOne(
        `UPDATE saree_purchases SET purchased_on = COALESCE($2, purchased_on), vendor = CASE WHEN $3::boolean THEN $4 ELSE vendor END,
           quantity = COALESCE($5, quantity), unit_price = COALESCE($6, unit_price), purchased_by = COALESCE($7, purchased_by),
           notes = CASE WHEN $8::boolean THEN $9 ELSE notes END, proof_file_id = $10, photo_file_id = $11, updated_by = $12
         WHERE id = $1 RETURNING *`,
        [rid, data.purchasedOn ?? null, data.vendor !== undefined, data.vendor ?? null, data.quantity ?? null, data.unitPrice ?? null,
          data.purchasedBy ?? null, data.notes !== undefined, data.notes ?? null, billId, photoId, req.user!.id],
        c,
      );
      if ((await remaining(before.event_id, c)) < 0) throw badRequest('That would leave fewer sarees purchased than already sold');
      await audit(req, {
        action: 'update', entityType: 'saree_purchase', entityId: rid, eventId: before.event_id,
        summary: `${req.user!.name} edited a saree purchase (${before.quantity} × ${inr(before.unit_price)} → ${after.quantity} × ${inr(after.unit_price)})`,
        details: diff(before, after, ['purchased_on', 'vendor', 'quantity', 'unit_price', 'purchased_by', 'notes', 'proof_file_id', 'photo_file_id']),
      }, c);
      return { year, purchase: await queryOne(`${PURCHASE_SELECT} WHERE p.id = $1`, [rid], c) };
    });
  });
  notifyChange('finance', result.year);
  res.json({ purchase: result.purchase });
});

sareesRouter.put('/saree-sales/:id', upload, async (req, res) => {
  const rid = id.parse(req.params.id);
  const data = body(req, saleSchema.partial());
  const result = await trackUploads(req, async (keys) => {
    const pre = await queryOne('SELECT created_by, event_id FROM saree_sales WHERE id = $1 AND deleted_at IS NULL', [rid]);
    if (!pre) throw notFound('Sale');
    assertOwnerOrAdmin(req, [pre.created_by]);
    const year = (await queryOne('SELECT year FROM events WHERE id = $1', [pre.event_id]))!.year;
    const files = await storeSareeFiles(req, year, keys);
    return tx(async (c) => {
      const before = await loadForChange('sale', rid, c);
      const photoId = files.photo ? await insertFile(c, files.photo, 'saree_photo', before.event_id, req.user!.id) : before.photo_file_id;
      const after = await queryOne(
        `UPDATE saree_sales SET sold_on = COALESCE($2, sold_on), customer_name = COALESCE($3, customer_name),
           quantity = COALESCE($4, quantity), unit_price = COALESCE($5, unit_price),
           notes = CASE WHEN $6::boolean THEN $7 ELSE notes END, photo_file_id = $8, updated_by = $9
         WHERE id = $1 RETURNING *`,
        [rid, data.soldOn ?? null, data.customerName ?? null, data.quantity ?? null, data.unitPrice ?? null, data.notes !== undefined, data.notes ?? null, photoId, req.user!.id],
        c,
      );
      const left = await remaining(before.event_id, c);
      if (left < 0) throw badRequest(`Not enough stock: only ${left + after.quantity} available for this sale`);
      await audit(req, {
        action: 'update', entityType: 'saree_sale', entityId: rid, eventId: before.event_id,
        summary: `${req.user!.name} edited a saree sale to ${after.customer_name} (${before.quantity} → ${after.quantity})`,
        details: diff(before, after, ['sold_on', 'customer_name', 'quantity', 'unit_price', 'notes', 'photo_file_id']),
      }, c);
      return { year, sale: await queryOne(`${SALE_SELECT} WHERE s.id = $1`, [rid], c) };
    });
  });
  notifyChange('finance', result.year);
  res.json({ sale: result.sale });
});

for (const kind of ['purchase', 'sale'] as const) {
  sareesRouter.delete(`/saree-${kind === 'purchase' ? 'purchases' : 'sales'}/:id`, requireAdmin, async (req, res) => {
    const rid = id.parse(req.params.id);
    const { reason } = body(req, z.object({ reason: optionalText(500) }));
    const year = await tx(async (c) => {
      const row = await loadForChange(kind, rid, c);
      await c.query(`UPDATE ${TABLE[kind]} SET deleted_at = now(), updated_by = $2 WHERE id = $1`, [rid, req.user!.id]);
      if (kind === 'purchase' && (await remaining(row.event_id, c)) < 0) {
        throw badRequest('Cannot delete this purchase: more sarees have been sold than would remain purchased');
      }
      await audit(req, {
        action: 'delete', entityType: `saree_${kind}`, entityId: rid, eventId: row.event_id,
        summary: `${req.user!.name} deleted a saree ${kind} of ${row.quantity} × ${inr(row.unit_price)}`,
        details: { reason, quantity: row.quantity, unit_price: row.unit_price },
      }, c);
      return row.year;
    });
    notifyChange('finance', year);
    res.json({ ok: true });
  });
}
