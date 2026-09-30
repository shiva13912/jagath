import { Router } from 'express';
import { queryOne } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { id } from '../../middleware/validate.js';
import { storage } from '../../services/storage/index.js';
import { notFound } from '../../utils/errors.js';

/**
 * Private documents (payment screenshots, bills, saree photos/bills).
 * Only logged-in team members and admins can read them. There is deliberately
 * no public route to this table.
 */
export const filesRouter = Router();
filesRouter.use(authenticate);

filesRouter.get('/:id', async (req, res) => {
  const fid = id.parse(req.params.id);
  const f = await queryOne('SELECT storage_key, original_name, mime_type FROM files WHERE id = $1', [fid]);
  if (!f) throw notFound('File');
  const download = req.query.download === '1';
  // PDFs and images display inline; anything else downloads.
  const inline = !download && (f.mime_type.startsWith('image/') || f.mime_type === 'application/pdf');
  await storage.send(res, f.storage_key, { contentType: f.mime_type, downloadName: f.original_name, inline, cacheSeconds: 300 });
});
