import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db/pool.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { body, boolish } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';

/** Site-wide settings. Admin only (team members get 403). */
export const settingsRouter = Router();
settingsRouter.use(authenticate, requireAdmin);

const schema = z
  .object({
    site_name: z.string().trim().min(1).max(100),
    tagline: z.string().trim().max(200),
    about: z.string().trim().max(10000),
    contact: z.string().trim().max(1000),
    auto_publish_member_uploads: boolish,
  })
  .partial()
  .strict();

settingsRouter.get('/', async (_req, res) => {
  const rows = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings ORDER BY key');
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

settingsRouter.put('/', async (req, res) => {
  const data = body(req, schema);
  await tx(async (c) => {
    for (const [key, value] of Object.entries(data)) {
      await c.query(
        `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), req.user!.id],
      );
    }
    await audit(req, { action: 'update', entityType: 'settings', summary: `${req.user!.name} updated site settings`, details: { keys: Object.keys(data) } }, c);
  });
  res.json({ ok: true });
});
