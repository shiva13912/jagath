import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, queryOne, tx } from '../../db/pool.js';
import { assertOwnerOrAdmin, authenticate, isAdmin, optionalAuth, requireAdmin } from '../../middleware/auth.js';
import { detectType, EXT, PHOTO_TYPES, uploader, VIDEO_TYPES } from '../../middleware/upload.js';
import { body, boolish, id, optionalText, queryParams, requiredText } from '../../middleware/validate.js';
import { audit, notifyChange } from '../../services/audit.js';
import { trackUploads } from '../../services/files.js';
import { processPhoto } from '../../services/images.js';
import { storage } from '../../services/storage/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { diff } from '../../utils/format.js';
import { eventByYear } from '../events/events.service.js';
import { MEDIA_COLUMNS, PUBLIC_MEDIA_WHERE } from './media.service.js';

/** Albums, photos and videos. Mounted at /api. */
export const mediaRouter = Router();

// Largest allowed file overall is a video; photos are checked again after type detection.
const mediaUpload = uploader(Math.max(config.limits.video, config.limits.photo), 20).array('files', 20);

const ALBUM_SELECT = `
  SELECT a.id, a.event_id, ev.year, a.name, a.description, a.is_public, a.sort_order, a.cover_media_id, a.created_by, a.created_at,
         COUNT(m.id) FILTER (WHERE m.type = 'photo') AS photo_count,
         COUNT(m.id) FILTER (WHERE m.type = 'video') AS video_count,
         COUNT(m.id) FILTER (WHERE m.is_public) AS public_count,
         COUNT(m.id) FILTER (WHERE NOT m.is_public) AS pending_count,
         COALESCE(a.cover_media_id, (SELECT id FROM media x WHERE x.album_id = a.id AND x.deleted_at IS NULL AND x.thumb_key IS NOT NULL ORDER BY x.is_featured DESC, x.created_at LIMIT 1)) AS cover_id
  FROM albums a
  JOIN events ev ON ev.id = a.event_id
  LEFT JOIN media m ON m.album_id = a.id AND m.deleted_at IS NULL`;

// ---- Serving files (public OR team, decided per request) -----------------------

async function loadServable(req: Request, mediaId: number) {
  const m = await queryOne(
    `SELECT m.*, (${PUBLIC_MEDIA_WHERE}) AS publicly_visible
     FROM media m JOIN albums a ON a.id = m.album_id JOIN events ev ON ev.id = m.event_id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [mediaId],
  );
  // Hidden items look exactly like missing ones to the public (no existence leak).
  if (!m || (!req.user && !m.publicly_visible)) throw notFound('Media');
  return m;
}

mediaRouter.get('/media/:id/thumb', optionalAuth, async (req, res) => {
  const m = await loadServable(req, id.parse(req.params.id));
  if (!m.thumb_key) throw notFound('Thumbnail');
  await storage.send(res, m.thumb_key, { contentType: 'image/webp', cacheSeconds: 3600 });
});

mediaRouter.get('/media/:id/file', optionalAuth, async (req, res) => {
  const m = await loadServable(req, id.parse(req.params.id));
  const download = req.query.download === '1';
  if (download && !req.user && !m.allow_download) throw forbidden('Download is not enabled for this item');
  const name = m.original_name.replace(/\.[^.]+$/, '') + '.' + (EXT[m.mime_type] ?? 'bin');
  await storage.send(res, m.storage_key, { contentType: m.mime_type, downloadName: name, inline: !download, cacheSeconds: 3600 });
});

// Everything below requires login.
mediaRouter.use(['/events/:year/albums', '/events/:year/media', '/albums', '/media'], authenticate);

// ---- Albums -------------------------------------------------------------------

mediaRouter.get('/events/:year/albums', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const albums = await query(`${ALBUM_SELECT} WHERE a.event_id = $1 AND a.deleted_at IS NULL GROUP BY a.id, ev.year ORDER BY a.sort_order, a.created_at`, [ev.id]);
  res.json({ albums });
});

const albumSchema = z.object({
  name: requiredText(120, 'Album name'),
  description: optionalText(1000),
  isPublic: boolish.optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  coverMediaId: id.nullable().optional(),
});

mediaRouter.post('/events/:year/albums', async (req, res) => {
  const data = body(req, albumSchema);
  const ev = await eventByYear(req.params.year);
  const album = await tx(async (c) => {
    const next = await queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM albums WHERE event_id = $1', [ev.id], c);
    const row = await queryOne(
      `INSERT INTO albums (event_id, name, description, is_public, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ev.id, data.name, data.description, data.isPublic ?? true, data.sortOrder ?? next.n, req.user!.id],
      c,
    );
    await audit(req, { action: 'create', entityType: 'album', entityId: row.id, eventId: ev.id, summary: `${req.user!.name} created album "${data.name}" (${ev.year})` }, c);
    return queryOne(`${ALBUM_SELECT} WHERE a.id = $1 GROUP BY a.id, ev.year`, [row.id], c);
  });
  notifyChange('media', ev.year);
  res.status(201).json({ album });
});

mediaRouter.put('/albums/:id', async (req, res) => {
  const aid = id.parse(req.params.id);
  const data = body(req, albumSchema.partial());
  const result = await tx(async (c) => {
    const before = await queryOne('SELECT a.*, ev.year FROM albums a JOIN events ev ON ev.id = a.event_id WHERE a.id = $1 AND a.deleted_at IS NULL FOR UPDATE OF a', [aid], c);
    if (!before) throw notFound('Album');
    assertOwnerOrAdmin(req, [before.created_by]);
    // Public visibility is an admin decision.
    if (data.isPublic !== undefined && !isAdmin(req)) throw forbidden('Only admins can change public visibility');
    if (data.coverMediaId) {
      const ok = await queryOne('SELECT 1 FROM media WHERE id = $1 AND album_id = $2 AND deleted_at IS NULL', [data.coverMediaId, aid], c);
      if (!ok) throw badRequest('Cover must be a photo in this album');
    }
    const after = await queryOne(
      `UPDATE albums SET name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         is_public = COALESCE($5, is_public), sort_order = COALESCE($6, sort_order),
         cover_media_id = CASE WHEN $7::boolean THEN $8 ELSE cover_media_id END
       WHERE id = $1 RETURNING *`,
      [aid, data.name ?? null, data.description !== undefined, data.description ?? null, data.isPublic ?? null, data.sortOrder ?? null, data.coverMediaId !== undefined, data.coverMediaId ?? null],
      c,
    );
    await audit(req, { action: 'update', entityType: 'album', entityId: aid, eventId: before.event_id, summary: `${req.user!.name} updated album "${after.name}"`, details: diff(before, after, ['name', 'description', 'is_public', 'sort_order', 'cover_media_id']) }, c);
    return { year: before.year, album: await queryOne(`${ALBUM_SELECT} WHERE a.id = $1 GROUP BY a.id, ev.year`, [aid], c) };
  });
  notifyChange('media', result.year);
  res.json({ album: result.album });
});

mediaRouter.delete('/albums/:id', async (req, res) => {
  const aid = id.parse(req.params.id);
  const year = await tx(async (c) => {
    const a = await queryOne('SELECT a.*, ev.year FROM albums a JOIN events ev ON ev.id = a.event_id WHERE a.id = $1 AND a.deleted_at IS NULL FOR UPDATE OF a', [aid], c);
    if (!a) throw notFound('Album');
    assertOwnerOrAdmin(req, [a.created_by]);
    const count = (await queryOne('SELECT COUNT(*) AS n FROM media WHERE album_id = $1 AND deleted_at IS NULL', [aid], c))!.n;
    if (count > 0 && !isAdmin(req)) throw forbidden('Only admins can delete an album that has photos or videos');
    await c.query('UPDATE media SET deleted_at = now() WHERE album_id = $1 AND deleted_at IS NULL', [aid]);
    await c.query('UPDATE albums SET deleted_at = now() WHERE id = $1', [aid]);
    await audit(req, { action: 'delete', entityType: 'album', entityId: aid, eventId: a.event_id, summary: `${req.user!.name} deleted album "${a.name}" with ${count} item(s)` }, c);
    return a.year;
  });
  notifyChange('media', year);
  res.json({ ok: true });
});

// ---- Media -------------------------------------------------------------------

mediaRouter.get('/albums/:id/media', async (req, res) => {
  const aid = id.parse(req.params.id);
  const f = queryParams(req, z.object({ type: z.enum(['photo', 'video']).optional() }));
  const album = await queryOne(`${ALBUM_SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL GROUP BY a.id, ev.year`, [aid]);
  if (!album) throw notFound('Album');
  const items = await query(
    `SELECT ${MEDIA_COLUMNS}, m.uploaded_by, u.name AS uploaded_by_name
     FROM media m JOIN albums a ON a.id = m.album_id JOIN users u ON u.id = m.uploaded_by
     WHERE m.album_id = $1 AND m.deleted_at IS NULL ${f.type ? 'AND m.type = $2' : ''}
     ORDER BY m.created_at DESC, m.id DESC`,
    f.type ? [aid, f.type] : [aid],
  );
  res.json({ album, items });
});

/** All media for a year (videos page, recent strip). */
mediaRouter.get('/events/:year/media', async (req, res) => {
  const ev = await eventByYear(req.params.year);
  const f = queryParams(req, z.object({ type: z.enum(['photo', 'video']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100), pending: boolish.optional() }));
  const params: unknown[] = [ev.id];
  let where = 'm.event_id = $1 AND m.deleted_at IS NULL AND a.deleted_at IS NULL';
  if (f.type) { params.push(f.type); where += ` AND m.type = $${params.length}`; }
  if (f.pending) where += ' AND NOT m.is_public';
  const items = await query(
    `SELECT ${MEDIA_COLUMNS}, m.uploaded_by, u.name AS uploaded_by_name
     FROM media m JOIN albums a ON a.id = m.album_id JOIN users u ON u.id = m.uploaded_by
     WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ${f.limit}`,
    params,
  );
  res.json({ items });
});

mediaRouter.post('/albums/:id/media', mediaUpload, async (req, res) => {
  const aid = id.parse(req.params.id);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const result = await trackUploads(req, async (keys) => {
    if (!files.length) throw badRequest('Choose at least one photo or video');
    const data = body(req, z.object({ description: optionalText(500) }));
    const album = await queryOne('SELECT a.*, ev.year FROM albums a JOIN events ev ON ev.id = a.event_id WHERE a.id = $1 AND a.deleted_at IS NULL AND ev.deleted_at IS NULL', [aid]);
    if (!album) throw notFound('Album');
    const autoPublish = isAdmin(req) || (await queryOne("SELECT value FROM settings WHERE key = 'auto_publish_member_uploads'"))?.value === true;

    // Validate everything before storing anything.
    const typed: Array<{ file: Express.Multer.File; mime: string; type: 'photo' | 'video' }> = [];
    for (const file of files) {
      const mime = await detectType(file, [...PHOTO_TYPES, ...VIDEO_TYPES], 'File');
      const type = mime.startsWith('video/') ? 'video' : 'photo';
      if (type === 'photo' && file.size > config.limits.photo) throw badRequest(`Photo "${file.originalname}" is larger than ${config.MAX_PHOTO_MB} MB`);
      typed.push({ file, mime, type });
    }

    const rows: any[] = [];
    for (const t of typed) {
      const uuid = crypto.randomUUID();
      const key = `events/${album.year}/media/${uuid}.${EXT[t.mime]}`;
      let thumbKey: string | null = null;
      let dims: { width: number | null; height: number | null; size: number } = { width: null, height: null, size: t.file.size };
      if (t.type === 'photo') {
        const clean = `${t.file.path}.clean`;
        const thumb = `${t.file.path}.thumb.webp`;
        try {
          dims = await processPhoto(t.file.path, t.mime, clean, thumb);
        } catch {
          throw badRequest(`Could not read photo "${t.file.originalname}". Is the file damaged?`);
        }
        thumbKey = `events/${album.year}/thumbs/${uuid}.webp`;
        await storage.put(key, clean, t.mime);
        keys.push(key);
        await storage.put(thumbKey, thumb, 'image/webp');
        keys.push(thumbKey);
        await Promise.all([fs.rm(clean, { force: true }), fs.rm(thumb, { force: true })]);
      } else {
        await storage.put(key, t.file.path, t.mime);
        keys.push(key);
      }
      rows.push({ ...t, key, thumbKey, dims, name: path.basename(t.file.originalname).slice(0, 200) });
    }

    return tx(async (c) => {
      const inserted = [];
      for (const r of rows) {
        const row = await queryOne(
          `INSERT INTO media (event_id, album_id, type, storage_key, thumb_key, original_name, mime_type, size_bytes, width, height, description, is_public, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [album.event_id, aid, r.type, r.key, r.thumbKey, r.name, r.mime, r.dims.size, r.dims.width, r.dims.height, data.description, autoPublish, req.user!.id],
          c,
        );
        inserted.push(row.id);
      }
      const photos = rows.filter((r) => r.type === 'photo').length;
      const videos = rows.length - photos;
      const what = [photos && `${photos} photo${photos > 1 ? 's' : ''}`, videos && `${videos} video${videos > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
      await audit(req, {
        action: 'upload', entityType: 'media', entityId: inserted.join(','), eventId: album.event_id,
        summary: `${req.user!.name} uploaded ${what} to "${album.name}"${autoPublish ? '' : ' (awaiting approval)'}`,
      }, c);
      const items = await query(`SELECT ${MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id WHERE m.id = ANY($1) ORDER BY m.id`, [inserted], c);
      return { year: album.year, items, published: autoPublish };
    });
  });
  notifyChange('media', result.year);
  res.status(201).json({ items: result.items, published: result.published });
});

const mediaUpdate = z.object({
  description: optionalText(500),
  albumId: id.optional(),
  isPublic: boolish.optional(),
  isFeatured: boolish.optional(),
  allowDownload: boolish.optional(),
});

mediaRouter.put('/media/:id', async (req, res) => {
  const mid = id.parse(req.params.id);
  const data = body(req, mediaUpdate);
  const result = await tx(async (c) => {
    const before = await queryOne('SELECT m.*, ev.year FROM media m JOIN events ev ON ev.id = m.event_id WHERE m.id = $1 AND m.deleted_at IS NULL FOR UPDATE OF m', [mid], c);
    if (!before) throw notFound('Media');
    assertOwnerOrAdmin(req, [before.uploaded_by]);
    if (!isAdmin(req) && (data.isPublic !== undefined || data.isFeatured !== undefined || data.allowDownload !== undefined)) {
      throw forbidden('Only admins can publish, feature or change download settings');
    }
    if (data.albumId) {
      const ok = await queryOne('SELECT 1 FROM albums WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL', [data.albumId, before.event_id], c);
      if (!ok) throw badRequest('Album must belong to the same year');
    }
    const after = await queryOne(
      `UPDATE media SET description = CASE WHEN $2::boolean THEN $3 ELSE description END, album_id = COALESCE($4, album_id),
         is_public = COALESCE($5, is_public), is_featured = COALESCE($6, is_featured), allow_download = COALESCE($7, allow_download)
       WHERE id = $1 RETURNING *`,
      [mid, data.description !== undefined, data.description ?? null, data.albumId ?? null, data.isPublic ?? null, data.isFeatured ?? null, data.allowDownload ?? null],
      c,
    );
    const changes = diff(before, after, ['description', 'album_id', 'is_public', 'is_featured', 'allow_download']);
    const verb = changes.is_public ? (after.is_public ? 'published' : 'hid') : 'updated';
    await audit(req, { action: changes.is_public ? 'publish' : 'update', entityType: 'media', entityId: mid, eventId: before.event_id, summary: `${req.user!.name} ${verb} ${before.type} "${before.original_name}"`, details: changes }, c);
    return { year: before.year };
  });
  notifyChange('media', result.year);
  res.json({ media: await queryOne(`SELECT ${MEDIA_COLUMNS} FROM media m JOIN albums a ON a.id = m.album_id WHERE m.id = $1`, [mid]) });
});

/** Admin bulk actions: approve a batch of uploads in one tap. */
mediaRouter.post('/media/bulk', requireAdmin, async (req, res) => {
  const { ids, action } = body(req, z.object({ ids: z.array(id).min(1).max(500), action: z.enum(['publish', 'unpublish', 'delete', 'feature', 'unfeature']) }));
  const sql: Record<string, string> = {
    publish: 'is_public = TRUE', unpublish: 'is_public = FALSE', delete: 'deleted_at = now()', feature: 'is_featured = TRUE', unfeature: 'is_featured = FALSE',
  };
  const years = await tx(async (c) => {
    const rows = await query(`UPDATE media SET ${sql[action]} WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, event_id`, [ids], c);
    const eventIds = [...new Set(rows.map((r) => r.event_id))];
    for (const e of eventIds) {
      await audit(req, { action: action === 'delete' ? 'delete' : 'publish', entityType: 'media', entityId: rows.filter((r) => r.event_id === e).map((r) => r.id).join(','), eventId: e, summary: `${req.user!.name} ${action}ed ${rows.filter((r) => r.event_id === e).length} item(s)` }, c);
    }
    return (await query('SELECT year FROM events WHERE id = ANY($1)', [eventIds], c)).map((r) => r.year);
  });
  years.forEach((y) => notifyChange('media', y));
  res.json({ ok: true });
});

mediaRouter.delete('/media/:id', async (req, res) => {
  const mid = id.parse(req.params.id);
  const year = await tx(async (c) => {
    const m = await queryOne('SELECT m.*, ev.year FROM media m JOIN events ev ON ev.id = m.event_id WHERE m.id = $1 AND m.deleted_at IS NULL FOR UPDATE OF m', [mid], c);
    if (!m) throw notFound('Media');
    assertOwnerOrAdmin(req, [m.uploaded_by]);
    await c.query('UPDATE media SET deleted_at = now() WHERE id = $1', [mid]);
    await audit(req, { action: 'delete', entityType: 'media', entityId: mid, eventId: m.event_id, summary: `${req.user!.name} deleted ${m.type} "${m.original_name}"` }, c);
    return m.year;
  });
  notifyChange('media', year);
  res.json({ ok: true });
});
