-- Website controls: admins choose what the public website shows, separately
-- from what the sales team sees in the catalogue app.

-- Per product: hide from the website while keeping it in the sales catalogue,
-- and pick the products shown on the home page.
ALTER TABLE products ADD COLUMN on_website INTEGER NOT NULL DEFAULT 1 CHECK(on_website IN (0, 1));
ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1));

-- Per category: hide the whole collection, set its order and an optional intro.
-- Categories without a row are shown, ordered by name after ordered ones.
CREATE TABLE website_categories (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 1000 CHECK(sort_order BETWEEN 0 AND 1000),
  intro TEXT NOT NULL DEFAULT '' CHECK(length(intro) <= 400)
);

-- Site-wide switches. The initial values keep today's behaviour: product
-- details, prices and stock appear only when the catalogue is public.
CREATE TABLE website_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  show_products INTEGER NOT NULL CHECK(show_products IN (0, 1)),
  show_prices INTEGER NOT NULL CHECK(show_prices IN (0, 1)),
  show_stock INTEGER NOT NULL CHECK(show_stock IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO website_settings(id, show_products, show_prices, show_stock)
SELECT 1, p, p, p FROM (SELECT COALESCE((SELECT mode = 'public' FROM catalogue_access WHERE id = 1), 0) AS p);

-- Name website changes in the activity log.
DROP TRIGGER product_changed;
CREATE TRIGGER product_changed AFTER UPDATE ON products BEGIN
  INSERT INTO activity(product_id, actor, action, detail, reason)
  VALUES(NEW.id, NEW.last_actor,
    CASE WHEN NEW.stock != OLD.stock THEN 'Stock changed'
         WHEN NEW.published != OLD.published THEN 'Publication changed'
         WHEN NEW.on_website != OLD.on_website OR NEW.featured != OLD.featured THEN 'Website display changed'
         ELSE 'Product updated' END,
    NEW.code || ' · ' || CASE WHEN NEW.stock != OLD.stock
      THEN OLD.stock || ' → ' || NEW.stock
      WHEN NEW.on_website != OLD.on_website OR NEW.featured != OLD.featured
      THEN NEW.name || ' · ' || CASE WHEN NEW.on_website = 1 THEN 'shown' ELSE 'hidden' END
        || CASE WHEN NEW.featured = 1 THEN ', featured' ELSE '' END
      ELSE NEW.name END,
    CASE WHEN NEW.stock != OLD.stock THEN (
      SELECT reason FROM stock_movements
      WHERE product_id=NEW.id AND expected_revision=OLD.revision
        AND previous_stock=OLD.stock AND new_stock=NEW.stock
    ) ELSE NULL END);
END;
