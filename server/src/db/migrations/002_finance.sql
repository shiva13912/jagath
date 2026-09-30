-- Phase 2: event years, roster, budget, contributions, other income, expenses and private files.

CREATE TABLE events (
  id                            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year                          INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  title                         TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description                   TEXT,
  location                      TEXT,
  start_date                    DATE,
  end_date                      DATE,
  default_expected_contribution NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (default_expected_contribution >= 0),
  -- Transparency switches, controlled by the admin per year:
  is_published                  BOOLEAN NOT NULL DEFAULT FALSE, -- year visible on the public site at all
  public_finance                BOOLEAN NOT NULL DEFAULT TRUE,  -- totals + category breakdown
  public_contributor_names      BOOLEAN NOT NULL DEFAULT FALSE, -- named contributor sheet with amounts
  public_expense_list           BOOLEAN NOT NULL DEFAULT FALSE, -- itemised expenses (never proofs)
  public_saree_sales            BOOLEAN NOT NULL DEFAULT FALSE, -- itemised saree sales
  created_by                    INTEGER REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                    TIMESTAMPTZ,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX events_year_unique ON events (year) WHERE deleted_at IS NULL;
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_event_fk FOREIGN KEY (event_id) REFERENCES events(id);
CREATE INDEX activity_logs_event_idx ON activity_logs (event_id, created_at DESC);

-- Who is expected to contribute in a year, and how much. Paid/pending/status are computed.
CREATE TABLE event_members (
  event_id        INTEGER NOT NULL REFERENCES events(id),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expected_amount NUMERIC(12,2) NOT NULL CHECK (expected_amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE TRIGGER event_members_updated_at BEFORE UPDATE ON event_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE budgets (
  event_id       INTEGER PRIMARY KEY REFERENCES events(id),
  planned_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  notes          TEXT,
  updated_by     INTEGER REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Private uploaded documents: payment screenshots, bills, saree photos.
CREATE TABLE files (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      INTEGER REFERENCES events(id),
  storage_key   TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  purpose       TEXT NOT NULL CHECK (purpose IN ('contribution_proof', 'expense_payment', 'expense_bill', 'saree_bill', 'saree_photo', 'other')),
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contributions (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on       DATE NOT NULL,
  method        TEXT CHECK (method IN ('upi', 'cash', 'bank', 'other')),
  reference     TEXT,
  notes         TEXT,
  proof_file_id INTEGER REFERENCES files(id),
  created_by    INTEGER NOT NULL REFERENCES users(id),
  updated_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX contributions_event_idx ON contributions (event_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX contributions_event_date_idx ON contributions (event_id, paid_on DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER contributions_updated_at BEFORE UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE other_incomes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  source      TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 200),
  received_on DATE NOT NULL,
  notes       TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX other_incomes_event_idx ON other_incomes (event_id) WHERE deleted_at IS NULL;
CREATE TRIGGER other_incomes_updated_at BEFORE UPDATE ON other_incomes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE expense_categories (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_categories_name_unique ON expense_categories (lower(name));

INSERT INTO expense_categories (name, sort_order) VALUES
  ('Decoration', 1), ('Food', 2), ('Flowers', 3), ('Sarees', 4), ('Transportation', 5),
  ('Sound', 6), ('Lighting', 7), ('Pooja materials', 8), ('Printing', 9), ('Other', 99);

CREATE TABLE expenses (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  spent_on    DATE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  paid_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vendor      TEXT,
  notes       TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX expenses_event_date_idx ON expenses (event_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX expenses_event_category_idx ON expenses (event_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX expenses_event_paid_by_idx ON expenses (event_id, paid_by) WHERE deleted_at IS NULL;
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE expense_proofs (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  file_id    INTEGER NOT NULL UNIQUE REFERENCES files(id),
  kind       TEXT NOT NULL CHECK (kind IN ('payment', 'bill')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX expense_proofs_expense_idx ON expense_proofs (expense_id) WHERE deleted_at IS NULL;
