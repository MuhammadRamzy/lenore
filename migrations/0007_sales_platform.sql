-- Sales quotation platform: team accounts, catalogue access modes, pricing
-- policy, numbered quotations with immutable versions, and aggregate views.

ALTER TABLE products ADD COLUMN slug TEXT;
UPDATE products SET slug = lower(replace(code, ' ', '-')) WHERE slug IS NULL;
CREATE UNIQUE INDEX products_slug ON products(slug);
-- Billing-ready fields (Stage B POS) that also help salespeople search.
ALTER TABLE products ADD COLUMN hsn TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN gst_rate_bp INTEGER CHECK(gst_rate_bp IS NULL OR gst_rate_bp BETWEEN 0 AND 10000);
ALTER TABLE products ADD COLUMN barcode TEXT;
CREATE UNIQUE INDEX products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- Inventory management.
ALTER TABLE products ADD COLUMN reorder_qty INTEGER NOT NULL DEFAULT 0 CHECK(reorder_qty BETWEEN 0 AND 1000000000);
ALTER TABLE products ADD COLUMN bin TEXT NOT NULL DEFAULT '';
-- Admin-only unit cost in paise for stock valuation.
ALTER TABLE products ADD COLUMN cost_paise INTEGER CHECK(cost_paise IS NULL OR cost_paise BETWEEN 0 AND 10000000000);
ALTER TABLE stock_movements ADD COLUMN kind TEXT NOT NULL DEFAULT 'adjustment'
  CHECK(kind IN ('receipt', 'issue', 'return_in', 'return_out', 'damage', 'count', 'adjustment', 'sale', 'purchase'));
CREATE INDEX stock_movements_product ON stock_movements(product_id, created_at);

-- Team members sign in with their phone number. The owner remains the
-- environment-provisioned account (user_id NULL, role 'owner').
CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE CHECK(phone GLOB '[0-9]*' AND length(phone) BETWEEN 7 AND 15),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'sales')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  -- Basis points; NULL follows the workspace default cap.
  max_discount_bp INTEGER CHECK(max_discount_bp IS NULL OR max_discount_bp BETWEEN 0 AND 10000),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at TEXT
);

ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES staff_users(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX sessions_user ON sessions(user_id);

ALTER TABLE catalogue_access ADD COLUMN mode TEXT NOT NULL DEFAULT 'public'
  CHECK(mode IN ('public', 'password', 'accounts'));
UPDATE catalogue_access SET mode = CASE WHEN enabled = 1 THEN 'password' ELSE 'public' END;

ALTER TABLE settings ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'mrp'
  CHECK(pricing_mode IN ('mrp', 'capped', 'free'));
ALTER TABLE settings ADD COLUMN discount_cap_bp INTEGER NOT NULL DEFAULT 1000
  CHECK(discount_cap_bp BETWEEN 0 AND 10000);
ALTER TABLE settings ADD COLUMN quote_validity_days INTEGER NOT NULL DEFAULT 15
  CHECK(quote_validity_days BETWEEN 1 AND 365);
ALTER TABLE settings ADD COLUMN quote_terms TEXT NOT NULL DEFAULT
  'Prices are suggested MRP in INR, inclusive of applicable taxes unless stated. Availability is confirmed at the time of order. This quotation does not reserve stock.';

CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  share_token TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'won', 'lost')),
  channel TEXT NOT NULL CHECK(channel IN ('staff', 'shared', 'public')),
  created_by TEXT,
  created_by_name TEXT NOT NULL,
  created_by_phone TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_place TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL,
  -- Terms are snapshotted so later settings changes never alter an issued quote.
  terms TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL CHECK(json_valid(items_json)),
  item_count INTEGER NOT NULL CHECK(item_count > 0),
  mrp_total_paise INTEGER,
  discount_paise INTEGER,
  total_paise INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX quotations_owner ON quotations(created_by, updated_at);
CREATE INDEX quotations_created ON quotations(created_at);
CREATE INDEX quotations_status ON quotations(status, updated_at);

CREATE TABLE quotation_versions (
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (quotation_id, version)
);
CREATE TRIGGER quotation_versions_no_update BEFORE UPDATE ON quotation_versions BEGIN
  SELECT RAISE(ABORT, 'Quotation history is immutable.');
END;
CREATE TRIGGER quotation_versions_no_delete BEFORE DELETE ON quotation_versions BEGIN
  SELECT RAISE(ABORT, 'Quotation history cannot be deleted.');
END;

-- Aggregated per day; nothing identifies the visitor.
CREATE TABLE product_views (
  day TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);
