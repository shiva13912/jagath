-- Phase 4: albums, photos and videos. Binaries live in object storage; only metadata here.

CREATE TABLE albums (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id),
  name           TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description    TEXT,
  is_public      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  cover_media_id INTEGER,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX albums_event_name_unique ON albums (event_id, lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER albums_updated_at BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE media (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id),
  album_id       INTEGER NOT NULL REFERENCES albums(id),
  type           TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  storage_key    TEXT NOT NULL UNIQUE,
  thumb_key      TEXT,
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0),
  width          INTEGER,
  height         INTEGER,
  description    TEXT,
  is_public      BOOLEAN NOT NULL DEFAULT FALSE,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured    BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by    INTEGER NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX media_album_idx ON media (album_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_event_type_idx ON media (event_id, type, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_public_idx ON media (event_id, type) WHERE deleted_at IS NULL AND is_public;
CREATE INDEX media_featured_idx ON media (is_featured) WHERE deleted_at IS NULL AND is_featured AND is_public;
CREATE TRIGGER media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE albums ADD CONSTRAINT albums_cover_fk FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL;
