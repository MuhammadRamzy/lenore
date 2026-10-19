PRAGMA foreign_keys = ON;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  description TEXT NOT NULL DEFAULT '',
  price_paise INTEGER CHECK(price_paise IS NULL OR price_paise BETWEEN 0 AND 10000000000),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000000),
  low_stock INTEGER NOT NULL DEFAULT 5 CHECK(low_stock >= 0),
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0, 1)),
  image_key TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  last_actor TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX products_catalogue ON products(published, category, name);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT REFERENCES products(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER product_created AFTER INSERT ON products BEGIN
  INSERT INTO activity(product_id, actor, action, detail)
  VALUES(NEW.id, NEW.last_actor, 'Product created', NEW.code || ' · ' || NEW.name);
END;
CREATE TRIGGER product_changed AFTER UPDATE ON products BEGIN
  INSERT INTO activity(product_id, actor, action, detail)
  VALUES(NEW.id, NEW.last_actor,
    CASE WHEN NEW.stock != OLD.stock THEN 'Stock changed'
         WHEN NEW.published != OLD.published THEN 'Publication changed'
         ELSE 'Product updated' END,
    NEW.code || ' · ' || CASE WHEN NEW.stock != OLD.stock
      THEN OLD.stock || ' → ' || NEW.stock ELSE NEW.name END);
END;

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  delta INTEGER NOT NULL CHECK(delta != 0 AND delta BETWEEN -1000000000 AND 1000000000),
  previous_stock INTEGER NOT NULL CHECK(previous_stock >= 0),
  new_stock INTEGER NOT NULL CHECK(new_stock BETWEEN 0 AND 1000000000 AND new_stock = previous_stock + delta),
  expected_revision INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER stock_guard BEFORE INSERT ON stock_movements BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM products WHERE id = NEW.product_id
      AND revision = NEW.expected_revision AND stock = NEW.previous_stock
  ) THEN RAISE(ABORT, 'STOCK_CONFLICT') END;
END;
CREATE TRIGGER stock_post AFTER INSERT ON stock_movements BEGIN
  UPDATE products SET stock = NEW.new_stock, revision = revision + 1,
    last_actor = NEW.actor, updated_at = NEW.created_at WHERE id = NEW.product_id;
END;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX quotes_recent ON quotes(created_at);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  whatsapp TEXT NOT NULL DEFAULT ''
);
INSERT INTO settings(id) VALUES(1);
