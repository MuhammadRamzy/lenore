-- Each collection can have a designed cover image (R2 key), set by admins in
-- Workspace -> Website and shown on collection tiles.
ALTER TABLE website_categories ADD COLUMN cover_key TEXT;
CREATE INDEX website_categories_cover ON website_categories(cover_key);
