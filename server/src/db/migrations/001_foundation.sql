-- Phase 1: users, settings and the append-only activity log.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  email               TEXT NOT NULL CHECK (position('@' IN email) > 1),
  phone               TEXT,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_public_site BOOLEAN NOT NULL DEFAULT TRUE,
  email_public        BOOLEAN NOT NULL DEFAULT FALSE,
  phone_public        BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
-- Case-insensitive unique email.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_active_idx ON users (is_active) WHERE deleted_at IS NULL;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('site_name', '"Durgamatha Utsav"'),
  ('tagline', '"Celebrating Durgamatha together, every year."'),
  ('about', '"We are a group of friends and neighbours who organise the Durgamatha celebration every year. This site keeps a transparent, permanent record of our contributions, expenses, sarees, photos and videos."'),
  ('contact', '""'),
  ('auto_publish_member_uploads', 'false');

CREATE TABLE activity_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,          -- e.g. 'create', 'update', 'delete', 'login', 'upload'
  entity_type TEXT NOT NULL,          -- e.g. 'expense', 'contribution', 'user'
  entity_id   TEXT,
  event_id    INTEGER,                -- FK added in 002 once events exists
  summary     TEXT NOT NULL,          -- human readable: "Ravi added ₹4,000 expense (Decoration)"
  details     JSONB,                  -- before/after values for updates
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created_idx ON activity_logs (created_at DESC);
CREATE INDEX activity_logs_entity_idx ON activity_logs (entity_type, entity_id);

-- The audit log is append-only: nobody (including the app) can edit or delete history.
CREATE OR REPLACE FUNCTION activity_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER activity_logs_no_update BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION activity_logs_immutable();
CREATE TRIGGER activity_logs_no_truncate BEFORE TRUNCATE ON activity_logs
  FOR EACH STATEMENT EXECUTE FUNCTION activity_logs_immutable();
