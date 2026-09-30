-- Phase 3: saree purchases and sales. Inventory (purchased - sold) is computed, never stored.

CREATE TABLE saree_purchases (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  purchased_on  DATE NOT NULL,
  vendor        TEXT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_amount  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  purchased_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  proof_file_id INTEGER REFERENCES files(id),
  photo_file_id INTEGER REFERENCES files(id),
  notes         TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  updated_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX saree_purchases_event_idx ON saree_purchases (event_id, purchased_on DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER saree_purchases_updated_at BEFORE UPDATE ON saree_purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE saree_sales (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  sold_on       DATE NOT NULL,
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 200),
  quantity      INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_amount  NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  recorded_by   INTEGER NOT NULL REFERENCES users(id),
  photo_file_id INTEGER REFERENCES files(id),
  notes         TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  updated_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX saree_sales_event_idx ON saree_sales (event_id, sold_on DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER saree_sales_updated_at BEFORE UPDATE ON saree_sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
