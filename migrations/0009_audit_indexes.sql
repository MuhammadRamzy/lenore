-- Audit: supporting indexes for hot paths.
-- Catalogue change check (COUNT/MAX(updated_at) WHERE published=1) on every refresh.
CREATE INDEX products_published_updated ON products(published, updated_at);
-- Shift summaries and counter bill lists filter invoices by shift.
CREATE INDEX invoices_shift ON invoices(shift_id);
-- Expired-row cleanup scans by expiry.
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
-- Expenses paid from a drawer are summed per shift.
CREATE INDEX expenses_shift ON expenses(shift_id);
-- Every product image request checks publication by media key (was a full scan).
CREATE INDEX products_image_key ON products(image_key) WHERE image_key IS NOT NULL;
CREATE INDEX products_poster_key ON products(poster_key) WHERE poster_key IS NOT NULL;
