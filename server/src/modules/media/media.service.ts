/** The single definition of "the public may see this item". */
export const PUBLIC_MEDIA_WHERE = `
  m.deleted_at IS NULL AND m.is_public
  AND a.deleted_at IS NULL AND a.is_public
  AND ev.deleted_at IS NULL AND ev.is_published`;

export const PUBLIC_ALBUM_WHERE = `a.deleted_at IS NULL AND a.is_public AND ev.deleted_at IS NULL AND ev.is_published`;

export const MEDIA_COLUMNS = `m.id, m.album_id, a.name AS album_name, m.type, m.original_name, m.mime_type, m.size_bytes, m.width, m.height,
  m.description, m.is_public, m.allow_download, m.is_featured, (m.thumb_key IS NOT NULL) AS has_thumb, m.created_at`;

/** Columns safe for the public: no uploader identity or internal flags. */
export const PUBLIC_MEDIA_COLUMNS = `m.id, m.album_id, a.name AS album_name, ev.year, m.type, m.mime_type, m.size_bytes, m.width, m.height,
  m.description, m.allow_download, m.is_featured, (m.thumb_key IS NOT NULL) AS has_thumb, m.created_at`;
