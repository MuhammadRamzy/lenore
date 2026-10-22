-- One number that changes whenever anything the catalogue shows changes, so
-- phones polling every 30 s read one row instead of every product.
INSERT OR IGNORE INTO counters(name, value) VALUES('catalogue', 1);
CREATE TRIGGER catalogue_version_product_insert AFTER INSERT ON products BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_product_update AFTER UPDATE ON products BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_product_delete AFTER DELETE ON products BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_category_insert AFTER INSERT ON website_categories BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_category_update AFTER UPDATE ON website_categories BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_category_delete AFTER DELETE ON website_categories BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
CREATE TRIGGER catalogue_version_website AFTER UPDATE ON website_settings BEGIN
  UPDATE counters SET value = value + 1 WHERE name = 'catalogue';
END;
